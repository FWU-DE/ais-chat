import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGuardPrompt } from '../prompt';
import type { AiModel } from '../types';
import { ProviderConfigurationError } from '../../errors';
import { constructGoogleSafetyCheckFn } from './google';

const { captureExceptionMock, captureMessageMock, getClientMock, GoogleAuthMock } = vi.hoisted(
  () => {
    const getClientMock = vi.fn();
    const captureExceptionMock = vi.fn();
    const captureMessageMock = vi.fn();
    class GoogleAuthMock {
      getClient = getClientMock;
    }

    return { captureExceptionMock, captureMessageMock, getClientMock, GoogleAuthMock };
  },
);

vi.mock('google-auth-library', () => ({ GoogleAuth: GoogleAuthMock }));
vi.mock('@sentry/core', () => ({
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
}));

function createGoogleSafetyModel(): AiModel {
  return {
    id: 'google-safety-model',
    name: 'google-safety-model',
    displayName: 'Google Safety Model',
    description: 'Test safety model',
    provider: 'google',
    organizationId: 'org-test',
    createdAt: new Date(),
    supportedImageFormats: [],
    imageGenerationConfig: null,
    additionalParameters: {
      endpointId: 'endpoint-id',
      endpointHost: 'vertex.example.com',
    },
    isNew: false,
    isDeleted: false,
    useBifrost: false,
    setting: {
      provider: 'google',
      projectId: 'project-id',
      location: 'us-central1',
      authCredentials: { client_email: 'test@example.com' },
    },
    priceMetadata: {
      type: 'text',
      completionTokenPrice: 0,
      promptTokenPrice: 0,
    },
  } as AiModel;
}

describe('constructGoogleSafetyCheckFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ predictions: { choices: [{ message: { content: 'safe' } }] } }),
            { status: 200 },
          ),
        ),
    );
    getClientMock.mockResolvedValue({
      getAccessToken: vi.fn().mockResolvedValue({ token: 'token' }),
    });
  });

  it('sends one classifier user message containing the validated prompt', async () => {
    const model = createGoogleSafetyModel();

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [{ role: 'user', content: 'Current question' }],
    });

    const [requestUrl, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(requestUrl).toBe(
      'https://vertex.example.com/v1/projects/project-id/locations/us-central1/endpoints/endpoint-id:predict',
    );
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
    });
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ role: string; content: string }> }];
    };
    const requestMessages = body.instances[0].messages;

    expect(requestMessages).toEqual([
      {
        role: 'user',
        content: buildGuardPrompt([{ role: 'user', content: 'Current question' }]),
      },
    ]);
  });

  it('sends text-only input as string content', async () => {
    const model = createGoogleSafetyModel();

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [{ role: 'user', content: 'Current question' }],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ role: string; content: string }> }];
    };

    expect(body.instances[0].messages).toEqual([
      {
        role: 'user',
        content: buildGuardPrompt([{ role: 'user', content: 'Current question' }]),
      },
    ]);
  });

  it('forwards image attachments as classifier content', async () => {
    const model = createGoogleSafetyModel();
    const text = 'Describe this image';
    const image = {
      type: 'image' as const,
      contentType: 'image/png',
      url: 'data:image/png;base64,image',
    };

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [{ role: 'user', content: text, images: [image] }],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ role: string; content: unknown[] }> }];
    };

    expect(body.instances[0].messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildGuardPrompt([{ role: 'user', content: text, images: [image] }]),
          },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,image' } },
        ],
      },
    ]);
  });

  it('preserves remote image URLs in the classifier content', async () => {
    const model = createGoogleSafetyModel();

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [
        {
          role: 'user',
          content: 'Here is an image',
          images: [{ type: 'image', contentType: 'image/jpeg', url: 'https://example.com/a.jpg' }],
        },
      ],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ role: string; content: unknown[] }> }];
    };

    expect(body.instances[0].messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text' },
        { type: 'image_url', image_url: { url: 'https://example.com/a.jpg' } },
      ],
    });
  });

  it('forwards at most four valid images and reports dropped extras', async () => {
    const model = createGoogleSafetyModel();
    const images = Array.from({ length: 5 }, (_, index) => ({
      type: 'image' as const,
      contentType: 'image/png',
      url: `https://example.com/image-${index}.png`,
    }));

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [{ role: 'user', content: 'Check these images', images }],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ content: unknown[] }> }];
    };

    expect(body.instances[0].messages[0]?.content).toHaveLength(5);
    expect(body.instances[0].messages[0]?.content.slice(1)).toEqual(
      images.slice(0, 4).map((image) => ({ type: 'image_url', image_url: { url: image.url } })),
    );
    expect(captureMessageMock).toHaveBeenCalledWith(
      'Safety image attachments filtered',
      expect.objectContaining({
        level: 'warning',
        extra: {
          droppedImageCount: 1,
          maximumImageCount: 4,
        },
      }),
    );
  });

  it('filters invalid images while forwarding valid images', async () => {
    const model = createGoogleSafetyModel();
    const validImage = {
      type: 'image' as const,
      contentType: 'image/png',
      url: 'https://example.com/valid.png',
    };

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [
        {
          role: 'user',
          content: 'Check these images',
          images: [
            validImage,
            { type: 'image', contentType: 'text/plain', url: 'https://example.com/invalid' },
            { type: 'image', contentType: 'image/png', url: 'javascript:alert(1)' },
          ],
        },
      ],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ content: unknown[] }> }];
    };
    expect(body.instances[0].messages[0]?.content).toEqual([
      {
        type: 'text',
        text: buildGuardPrompt([
          { role: 'user', content: 'Check these images', images: [validImage] },
        ]),
      },
      { type: 'image_url', image_url: { url: validImage.url } },
    ]);
  });

  it('falls back to text-only moderation when all images are invalid', async () => {
    const model = createGoogleSafetyModel();

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [
        {
          role: 'user',
          content: 'Only moderate this text',
          images: [{ type: 'image', contentType: 'image/png', url: 'not-a-url' }],
        },
      ],
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    const body = JSON.parse(request?.body as string) as {
      instances: [{ messages: Array<{ content: unknown }> }];
    };
    expect(body.instances[0].messages).toEqual([
      {
        role: 'user',
        content: buildGuardPrompt([
          {
            role: 'user',
            content: 'Only moderate this text',
            images: [{ type: 'image', contentType: 'image/png', url: 'not-a-url' }],
          },
        ]),
      },
    ]);
  });

  it('captures invalid image count without image data', async () => {
    const model = createGoogleSafetyModel();

    await constructGoogleSafetyCheckFn(model)({
      model: model.name,
      messages: [
        {
          role: 'user',
          content: 'Check this',
          images: [
            { type: 'image', contentType: 'text/plain', url: 'https://example.com/private.png' },
            { type: 'image', contentType: 'image/png', url: 'data:image/png;base64,not valid!' },
          ],
        },
      ],
    });

    expect(captureMessageMock).toHaveBeenCalledWith(
      'Safety image attachments filtered',
      expect.objectContaining({
        level: 'warning',
        extra: { droppedImageCount: 2, maximumImageCount: 4 },
      }),
    );
    expect(JSON.stringify(captureMessageMock.mock.calls)).not.toContain('private.png');
    expect(JSON.stringify(captureMessageMock.mock.calls)).not.toContain('not valid');
  });

  it.each([
    ['malformed JSON', '{'],
    ['empty predictions', JSON.stringify({ predictions: [] })],
    [
      'empty content',
      JSON.stringify({ predictions: [{ choices: [{ message: { content: '' } }] }] }),
    ],
  ])('fails open for %s responses', async (_description, responseBody) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(responseBody, { status: 200 })));

    await expect(
      constructGoogleSafetyCheckFn(createGoogleSafetyModel())({
        model: 'google-safety-model',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).resolves.toEqual({ safe: true });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('returns unsafe when the provider omits categories', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ predictions: ['UNSAFE'] }), { status: 200 }),
        ),
    );

    await expect(
      constructGoogleSafetyCheckFn(createGoogleSafetyModel())({
        model: 'google-safety-model',
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).resolves.toEqual({ safe: false, categories: [] });
  });

  it.each([
    [
      'authentication failure',
      () => getClientMock.mockRejectedValue(new Error('private auth details')),
    ],
    [
      'missing access token',
      () => getClientMock.mockResolvedValue({ getAccessToken: vi.fn().mockResolvedValue({}) }),
    ],
    [
      'network failure',
      () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private URL'))),
    ],
    [
      'HTTP failure',
      () =>
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(new Response('private body', { status: 500 })),
        ),
    ],
  ])('fails open for %s', async (_description, configureFailure) => {
    configureFailure();

    await expect(
      constructGoogleSafetyCheckFn(createGoogleSafetyModel())({
        model: 'google-safety-model',
        messages: [{ role: 'user', content: 'private prompt' }],
      }),
    ).resolves.toEqual({ safe: true });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('rejects missing inline credentials', () => {
    const model = createGoogleSafetyModel();
    model.setting = {
      provider: 'google',
      projectId: 'project-id',
      location: 'us-central1',
      authCredentials: undefined,
    };

    expect(() => constructGoogleSafetyCheckFn(model)).toThrow('Google requires inline credentials');
  });

  it('rejects invalid inline credential JSON', () => {
    const model = createGoogleSafetyModel();
    model.setting = {
      provider: 'google',
      projectId: 'project-id',
      location: 'us-central1',
      authCredentials: 'not-json',
    };

    expect(() => constructGoogleSafetyCheckFn(model)).toThrow(
      'Google credentials must be valid JSON',
    );
  });

  it('rejects non-google models', () => {
    const model = createGoogleSafetyModel();
    model.setting = { ...model.setting, provider: 'openai' } as typeof model.setting;

    expect(() => constructGoogleSafetyCheckFn(model)).toThrow(
      'Invalid model configuration for Google',
    );
  });

  it.each([
    [
      'missing endpoint id',
      (model: AiModel) => {
        model.additionalParameters = { endpointHost: 'vertex.example.com' };
      },
    ],
    [
      'invalid endpoint id',
      (model: AiModel) => {
        model.additionalParameters = { endpointId: '', endpointHost: 'vertex.example.com' };
      },
    ],
    [
      'missing endpoint host',
      (model: AiModel) => {
        model.additionalParameters = { endpointId: 'endpoint-id' };
      },
    ],
    [
      'invalid endpoint host',
      (model: AiModel) => {
        model.additionalParameters = {
          endpointId: 'endpoint-id',
          endpointHost: 'https://private.example.com',
        };
      },
    ],
  ])('rejects configuration with %s', (_description, configureModel) => {
    const model = createGoogleSafetyModel();
    configureModel(model);

    expect(() => constructGoogleSafetyCheckFn(model)).toThrow(ProviderConfigurationError);
  });
});
