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

    expect(JSON.parse(result)).toEqual({
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

  it('retries once with the validation error and returns the corrected spec', async () => {
    mocks.generateTextWithBillingMock
      .mockResolvedValueOnce({ text: 'not json' })
      .mockResolvedValueOnce({ text: validSpec });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({ description: 'a point' });

    expect(JSON.parse(result)).toEqual({
      board: { boundingBox: [-5, 5, 5, -5] },
      elements: [['point', [0, 0]]],
    });
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledTimes(2);
  });

  it('returns an error string when the retry also fails validation', async () => {
    mocks.generateTextWithBillingMock.mockResolvedValue({ text: 'not json' });
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({ description: 'a point' });

    expect(result).toMatch(/^Error: /);
    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledTimes(2);
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

    await tool.handler({ description: 'a point' }, abortSignal);

    expect(mocks.generateTextWithBillingMock).toHaveBeenCalledWith(
      modelSelection,
      expect.anything(),
      'api-key-1',
      { abortSignal },
    );
  });

  it('returns an error without calling the model for an invalid description', async () => {
    const { buildJsxgraphTool } = await import('./jsxgraph-tool');
    const tool = buildJsxgraphTool({ modelSelection, apiKeyId: 'api-key-1' });

    const result = await tool.handler({ description: '' });

    expect(result).toBe('Error: Invalid description.');
    expect(mocks.generateTextWithBillingMock).not.toHaveBeenCalled();
  });
});
