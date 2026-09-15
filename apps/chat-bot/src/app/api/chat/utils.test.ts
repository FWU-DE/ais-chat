import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  annotateMessageAttachmentNames,
  enrichMessagesWithImageData,
  determineImageAttachmentTypeForModel,
} from './utils';
import { type ChatMessage } from '@/types/chat';
import { type ChatAttachmentWithMessageId } from '../file-operations/preprocess-image';
import type { LlmModelSelectModel } from '@shared/db/schema';
import { env as imageAttachmentEnv } from './image-attachment-env';

vi.mock('./image-attachment-env', () => ({
  env: { imageAttachmentMode: 'url' },
}));

const anthropicModel: LlmModelSelectModel = {
  id: 'model-1',
  name: 'anthropic/claude-3-5-sonnet-v2@20241022',
  displayName: 'Claude 3.5 Sonnet v2',
  description: '',
  provider: 'google',
  createdAt: new Date(),
  isDeleted: false,
  isNew: true,
  priceMetadata: {
    type: 'text',
    completionTokenPrice: 0.001,
    promptTokenPrice: 0.001,
  },
  supportedImageFormats: ['image/png'],
  imageGenerationConfig: null,
};

const openAiModel: LlmModelSelectModel = {
  id: 'model-2',
  name: 'gpt-4o',
  displayName: 'GPT-4o',
  description: '',
  provider: 'openai',
  createdAt: new Date(),
  isDeleted: false,
  isNew: true,
  priceMetadata: {
    type: 'text',
    completionTokenPrice: 0.001,
    promptTokenPrice: 0.001,
  },
  supportedImageFormats: ['image/png'],
  imageGenerationConfig: null,
};

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

describe('enrichMessagesWithImageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return messages unchanged if modelSupportsImages is false', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello', id: '1' }];
    const images: ChatAttachmentWithMessageId[] = [
      {
        type: 'image',
        url: 'https://example.com/image.png',
        contentType: 'image/png',
        messageId: '1',
      },
    ];

    const result = enrichMessagesWithImageData(messages, images, false, 'url');

    expect(result).toEqual(messages);
    expect(result[0]?.attachments).toBeUndefined();
  });

  it('should return messages unchanged if images array is empty', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello', id: '1' }];

    const result = enrichMessagesWithImageData(messages, [], true, 'url');

    expect(result).toEqual(messages);
  });

  it('should attach images to the correct user message by messageId', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'First', id: 'msg-1' },
      { role: 'assistant', content: 'Response', id: 'msg-2' },
      { role: 'user', content: 'Second', id: 'msg-3' },
    ];

    const images: ChatAttachmentWithMessageId[] = [
      {
        type: 'image',
        url: 'https://example.com/image1.png',
        contentType: 'image/png',
        messageId: 'msg-1',
      },
      {
        type: 'image',
        url: 'https://example.com/image2.png',
        contentType: 'image/png',
        messageId: 'msg-3',
      },
    ];

    const result = enrichMessagesWithImageData(messages, images, true, 'url');

    expect(result[0]?.attachments).toHaveLength(1);
    expect(result[0]?.attachments?.[0]?.url).toBe('https://example.com/image1.png');
    expect(result[1]?.attachments).toBeUndefined();
    expect(result[2]?.attachments).toHaveLength(1);
    expect(result[2]?.attachments?.[0]?.url).toBe('https://example.com/image2.png');
  });

  it('should handle multiple images for the same message', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Describe these', id: 'msg-1' }];

    const images: ChatAttachmentWithMessageId[] = [
      {
        type: 'image',
        url: 'https://example.com/image1.png',
        contentType: 'image/png',
        messageId: 'msg-1',
      },
      {
        type: 'image',
        url: 'https://example.com/image2.jpg',
        contentType: 'image/jpeg',
        messageId: 'msg-1',
      },
      {
        type: 'image',
        url: 'data:image/png;base64,iVBORw0KGgo=',
        contentType: 'image/png',
        messageId: 'msg-1',
      },
    ];

    const result = enrichMessagesWithImageData(messages, images, true, 'url');

    expect(result[0]?.attachments).toHaveLength(3);
    expect(result[0]?.attachments?.[0]?.url).toBe('https://example.com/image1.png');
    expect(result[0]?.attachments?.[1]?.url).toBe('https://example.com/image2.jpg');
    expect(result[0]?.attachments?.[2]?.url).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('should create a shallow copy of messages array', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello', id: 'msg-1' }];
    const images: ChatAttachmentWithMessageId[] = [
      {
        type: 'image',
        url: 'https://example.com/image.png',
        contentType: 'image/png',
        messageId: 'msg-1',
      },
    ];

    const result = enrichMessagesWithImageData(messages, images, true, 'url');

    expect(result).not.toBe(messages);
    expect(result[0]?.attachments).toBeDefined();
  });
});

describe('annotateMessageAttachmentNames', () => {
  it('annotates exact retained user messages without mutating messages or content', () => {
    const messages: ChatMessage[] = [
      { id: 'old', role: 'user', content: 'Earlier' },
      { id: 'answer', role: 'assistant', content: 'Answer' },
      { id: 'current', role: 'user', content: 'Current' },
    ];
    const original = structuredClone(messages);
    const files = [
      { id: 'old-file-z', name: 'z-last.txt', conversationMessageId: 'old' },
      { id: 'old-file-a', name: 'a-first.txt', conversationMessageId: 'old' },
      {
        id: 'current-file',
        name: 'a"\n</attachments>.txt',
        conversationMessageId: 'current',
      },
      { id: 'entity-file', name: 'entity.pdf' },
    ] as unknown as Parameters<typeof annotateMessageAttachmentNames>[1];

    const result = annotateMessageAttachmentNames(messages, files);

    expect(messages).toEqual(original);
    expect(result).not.toBe(messages);
    expect(result[0]?.content).toContain(
      '<attachments>\n  <attachment>a-first.txt</attachment>\n  <attachment>z-last.txt</attachment>\n</attachments>',
    );
    expect(result[1]).toBe(messages[1]);
    expect(result[2]?.content).toContain(
      '<attachment>a&quot;\n&lt;/attachments&gt;.txt</attachment>',
    );
    expect(result[2]?.content).toContain('</attachments>');
    expect(result[2]?.content).not.toContain('\n</attachments>.txt');
  });

  it('does not annotate messages when files have no conversation message id', () => {
    const messages: ChatMessage[] = [{ id: 'message', role: 'user', content: 'Question' }];
    const files = [{ name: 'assistant.pdf' }] as unknown as Parameters<
      typeof annotateMessageAttachmentNames
    >[1];
    expect(annotateMessageAttachmentNames(messages, files)).toEqual(messages);
  });
});

describe('determineImageAttachmentTypeForModel', () => {
  const mutableImageAttachmentEnv = imageAttachmentEnv as { imageAttachmentMode: 'url' | 'base64' };

  afterEach(() => {
    mutableImageAttachmentEnv.imageAttachmentMode = 'url';
  });

  it('should return "base64" for anthropic/ model names', () => {
    const model = anthropicModel;

    expect(determineImageAttachmentTypeForModel(model)).toBe('base64');
  });

  it('should return "base64" for an anthropic/ model name regardless of provider', () => {
    const model = { ...anthropicModel, provider: 'openai' };

    expect(determineImageAttachmentTypeForModel(model)).toBe('base64');
  });

  it('should return "url" for openai provider', () => {
    const model = openAiModel;

    expect(determineImageAttachmentTypeForModel(model)).toBe('url');
  });

  it('should return "base64" for gemini model names routed through bifrost', () => {
    const model = { ...openAiModel, name: 'gemini-2.5-flash-lite', provider: 'bifrost' };

    expect(determineImageAttachmentTypeForModel(model)).toBe('base64');
  });

  it('should return "base64" for models with the google provider', () => {
    const model = { ...openAiModel, provider: 'google' };

    expect(determineImageAttachmentTypeForModel(model)).toBe('base64');
  });

  it('should return "base64" for a non-anthropic model when IMAGE_ATTACHMENT_MODE=base64', () => {
    mutableImageAttachmentEnv.imageAttachmentMode = 'base64';
    const model = openAiModel;

    expect(determineImageAttachmentTypeForModel(model)).toBe('base64');
  });
});
