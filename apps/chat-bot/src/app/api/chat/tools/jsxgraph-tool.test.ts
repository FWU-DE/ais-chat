import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateTextWithBillingMock: vi.fn() }));
vi.mock('@ais-chat/ai-core', () => ({
  generateTextWithBilling: mocks.generateTextWithBillingMock,
}));

beforeEach(() => mocks.generateTextWithBillingMock.mockReset());

describe('buildJsxgraphTool', () => {
  const validSpec = '{"board":{"boundingBox":[-5,5,5,-5]},"elements":[["point",[0,0]]]}';
  const modelSelection = { modelIds: ['model-1'] as [string, ...string[]], modelName: 'model-1' };

  it('returns the validated spec from the model on the first try', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: validSpec });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({ description: 'a point at the origin' });

    expect(result).toEqual({
      board: { boundingBox: [-5, 5, 5, -5] },
      elements: [['point', [0, 0]]],
    });
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledTimes(1);
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledWith(
      modelSelection,
      expect.arrayContaining([{ role: 'user', content: 'a point at the origin' }]),
      'api-key-1',
      { abortSignal: undefined },
    );
  });

  it('returns an error envelope with the invalid JSON on a validation failure', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'not json' });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({ description: 'a point' });

    expect(result).toEqual({ error: expect.any(String), invalidJson: 'not json' });
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledTimes(1);
  });

  it('includes the previous attempt and error in the retry call', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: validSpec });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({
      description: 'a point',
      previousAttempt: 'not json',
      previousError: 'Plot source is not valid JSON',
    });

    expect(result).toEqual({
      board: { boundingBox: [-5, 5, 5, -5] },
      elements: [['point', [0, 0]]],
    });
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledTimes(1);
    const messages = mocks.generateTextWithBillingMock.mock.calls[0]?.[1];
    expect(messages).toEqual(
      expect.arrayContaining([
        { role: 'assistant', content: 'not json' },
        {
          role: 'user',
          content:
            'The JSON was invalid: Plot source is not valid JSON\nReturn the corrected version as pure JSON, without explanation.',
        },
      ]),
    );
  });

  it('includes every property in "required" for strict function-calling schemas', async () => {
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const { properties, required } = tool.definition.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(required).toEqual(Object.keys(properties));
  });

  it('includes the generated allowlists in the system prompt', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: validSpec });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    await tool.handler({ description: 'a point' });

    const systemMessage = mocks.generateTextWithBillingMock.mock.calls[0]?.[1][0].content;
    expect(systemMessage).toContain('functiongraph3d');
    expect(systemMessage).toContain('nthroot');
  });

  it('forwards the abort signal to generateTextWithBilling', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: validSpec });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });
    const abortSignal = new AbortController().signal;

    await tool.handler({ description: 'a point' }, { abortSignal });

    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledWith(
      modelSelection,
      expect.anything(),
      'api-key-1',
      { abortSignal },
    );
  });

  it('treats explicit nulls the same as omitted retry context', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: validSpec });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    await tool.handler({ description: 'a point', previousAttempt: null, previousError: null });

    const messages = mocks.generateTextWithBillingMock.mock.calls[0]?.[1];
    expect(messages).toHaveLength(2);
  });

  it('returns an error without calling the model for an invalid description', async () => {
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({ description: '' });

    expect(result).toEqual({ error: 'Invalid description.' });
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });

  it('reports the sub-call usage so it gets billed to the user', async () => {
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    mocks.generateTextWithBillingMock.mockResolvedValue({
      text: validSpec,
      modelId: 'model-1',
      usage,
      priceInCents: 3,
      provider: 'bifrost-anthropic',
      modelName: 'claude-x',
    });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });
    const reportUsage = vi.fn();

    await tool.handler({ description: 'a point' }, { reportUsage });

    expect(reportUsage).toHaveBeenCalledWith({
      modelId: 'model-1',
      usage,
      priceInCents: 3,
      provider: 'bifrost-anthropic',
      modelName: 'claude-x',
    });
  });
});

describe('createPlotActivity', () => {
  it('createStep sets only id and tool, with no detail', async () => {
    const { createPlotActivity } = await import('./jsxgraph-tool');

    const step = createPlotActivity.createStep({
      id: 'call-1',
      name: 'create_plot',
      arguments: JSON.stringify({ description: 'a point at the origin' }),
    });

    expect(step).toEqual({ kind: 'tool', id: 'call-1', tool: 'create_plot' });
  });

  it('parsePersistedResult passes a persisted plot spec through unchanged', async () => {
    const { createPlotActivity } = await import('./jsxgraph-tool');

    const raw = { board: { boundingBox: [-5, 5, 5, -5] }, elements: [['point', [0, 0]]] };
    expect(createPlotActivity.parsePersistedResult(raw)).toEqual(raw);
  });

  it('parsePersistedResult passes a persisted error result through unchanged', async () => {
    const { createPlotActivity } = await import('./jsxgraph-tool');

    expect(createPlotActivity.parsePersistedResult({ error: 'Invalid description.' })).toEqual({
      error: 'Invalid description.',
    });
  });
});
