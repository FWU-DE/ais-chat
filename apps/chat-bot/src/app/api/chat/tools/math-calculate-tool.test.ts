import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calculateMock: vi.fn() }));
vi.mock('../calculator', () => ({
  calculate: mocks.calculateMock,
  CALCULATOR_MAX_EXPRESSION_LENGTH: 4_096,
}));

beforeEach(() => mocks.calculateMock.mockReset());

describe('buildMathCalculateTool', () => {
  it('defines calculator examples and serializes valid handler results', async () => {
    mocks.calculateMock.mockResolvedValue({ status: 'success', result: '4', error: null });
    const { buildMathCalculateTool } = await import('./math-calculate-tool');
    const tool = buildMathCalculateTool();
    if (!tool) throw new Error('expected enabled calculator tool');
    expect(tool.definition.name).toBe('math_calculate');
    expect(tool.definition.parameters).toMatchObject({
      properties: { expression: { minLength: 1 } },
    });
    expect(JSON.parse(await tool.handler({ expression: ' 2 + 2 ' }))).toEqual({
      status: 'success',
      result: '4',
      error: null,
    });
    expect(mocks.calculateMock).toHaveBeenCalledWith('2 + 2');
  });

  it('serializes calculator errors without changing them', async () => {
    mocks.calculateMock.mockResolvedValue({
      status: 'invalid_input',
      result: null,
      error: 'Calculator could not parse the expression.',
    });
    const { buildMathCalculateTool } = await import('./math-calculate-tool');
    const tool = buildMathCalculateTool();
    if (!tool) throw new Error('expected enabled calculator tool');

    expect(JSON.parse(await tool.handler({ expression: 'not valid' }))).toEqual({
      status: 'invalid_input',
      result: null,
      error: 'Calculator could not parse the expression.',
    });
  });

  it('returns JSON for invalid expressions without calling the client', async () => {
    const { buildMathCalculateTool } = await import('./math-calculate-tool');
    const tool = buildMathCalculateTool();
    if (!tool) throw new Error('expected enabled calculator tool');
    const raw = await tool.handler({ expression: '' });
    expect(JSON.parse(raw)).toMatchObject({ status: 'invalid_input' });
    expect(mocks.calculateMock).not.toHaveBeenCalled();
  });
});
