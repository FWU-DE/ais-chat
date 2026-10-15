import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calculateMock: vi.fn() }));
vi.mock('../calculator', () => ({
  calculate: mocks.calculateMock,
  CALCULATOR_MAX_EXPRESSION_LENGTH: 4_096,
}));

beforeEach(() => mocks.calculateMock.mockReset());

describe('buildMathCalculateTool', () => {
  it('defines calculator examples and returns the result on success', async () => {
    mocks.calculateMock.mockResolvedValue({ status: 'success', result: '4' });
    const { buildMathCalculateTool } = await import('./math-calculate-tool');
    const tool = buildMathCalculateTool();
    if (!tool) throw new Error('expected enabled calculator tool');
    expect(tool.definition.name).toBe('math_calculate');
    expect(tool.definition.parameters).toMatchObject({
      properties: { expression: { minLength: 1 } },
    });
    expect(await tool.handler({ expression: ' 2 + 2 ' })).toEqual({
      status: 'success',
      result: '4',
    });
    expect(mocks.calculateMock).toHaveBeenCalledWith('2 + 2');
  });

  it('surfaces calculator failures with full error details', async () => {
    mocks.calculateMock.mockResolvedValue({
      status: 'invalid_input',
      error: 'Calculator could not parse the expression.',
    });
    const { buildMathCalculateTool } = await import('./math-calculate-tool');
    const tool = buildMathCalculateTool();
    if (!tool) throw new Error('expected enabled calculator tool');

    expect(await tool.handler({ expression: 'not valid' })).toEqual({
      status: 'invalid_input',
      error: 'Calculator could not parse the expression.',
    });
  });

  it('returns an error for invalid expressions without calling the client', async () => {
    const { buildMathCalculateTool } = await import('./math-calculate-tool');
    const tool = buildMathCalculateTool();
    if (!tool) throw new Error('expected enabled calculator tool');
    expect(await tool.handler({ expression: '' })).toEqual({
      status: 'invalid_input',
      error: 'Invalid expression.',
    });
    expect(mocks.calculateMock).not.toHaveBeenCalled();
  });
});
