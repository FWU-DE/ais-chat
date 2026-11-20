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

describe('mathCalculateActivity.createStep', () => {
  it('sets detail to the parsed expression for valid arguments', async () => {
    const { mathCalculateActivity } = await import('./math-calculate-tool');

    const step = mathCalculateActivity.createStep({
      id: 'call-1',
      name: 'math_calculate',
      arguments: JSON.stringify({ expression: '2 + 2' }),
    });

    expect(step).toEqual({
      kind: 'tool',
      id: 'call-1',
      tool: 'math_calculate',
      detail: '2 + 2',
    });
  });

  it('leaves detail undefined for invalid arguments', async () => {
    const { mathCalculateActivity } = await import('./math-calculate-tool');

    const step = mathCalculateActivity.createStep({
      id: 'call-1',
      name: 'math_calculate',
      arguments: JSON.stringify({ expression: '' }),
    });

    expect(step.detail).toBeUndefined();
  });
});

describe('mathCalculateActivity.applyResult', () => {
  it('copies the result onto the step', async () => {
    const { mathCalculateActivity } = await import('./math-calculate-tool');

    const step = { kind: 'tool', id: 'call-1', tool: 'math_calculate' } as const;
    expect(
      mathCalculateActivity.applyResult!(step, {
        status: 'success',
        result: '4',
      }),
    ).toEqual({ ...step, result: '4' });
  });
});

describe('mathCalculateActivity.parsePersistedResult', () => {
  it('passes a legacy success result with a stale `error: null` through unchanged', async () => {
    const { mathCalculateActivity } = await import('./math-calculate-tool');

    expect(
      mathCalculateActivity.parsePersistedResult({
        status: 'success',
        result: '4',
        error: null,
      }),
    ).toEqual({ status: 'success', result: '4', error: null });
  });

  it('passes a current error result through unchanged', async () => {
    const { mathCalculateActivity } = await import('./math-calculate-tool');

    expect(mathCalculateActivity.parsePersistedResult({ error: 'Invalid expression.' })).toEqual({
      error: 'Invalid expression.',
    });
  });

  it('returns undefined for unparseable persisted raw data', async () => {
    const { mathCalculateActivity } = await import('./math-calculate-tool');

    expect(mathCalculateActivity.parsePersistedResult(null)).toBeUndefined();
  });
});
