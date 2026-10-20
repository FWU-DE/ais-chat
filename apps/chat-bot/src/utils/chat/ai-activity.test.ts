import type { MathCalculateToolSuccessResponse } from '@/app/api/chat/tools/math-calculate-tool';
import { parseGenericPersistedToolResult } from '@/app/api/chat/tools/parse-persisted-tool-result';
import type { ToolActivity } from '@/app/api/chat/tools/types';
import type { ToolCall, ToolResult } from '@ais-chat/ai-core/chat/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiActivityCollector } from './ai-activity';

const toolCall: ToolCall = {
  id: 'call-1',
  name: 'math_calculate',
  arguments: '{}',
};

// Mutable so each test can register exactly the activities it needs: `createAiActivityCollector`
// always reads the real `toolActivityRegistry`, so tests control it through this mock instead of
// passing a registry in.
const mockToolActivityRegistry: Record<string, ToolActivity> = vi.hoisted(() => ({}));

vi.mock('@/app/api/chat/build-tools', () => ({
  toolActivityRegistry: mockToolActivityRegistry,
}));

afterEach(() => {
  for (const key of Object.keys(mockToolActivityRegistry)) {
    delete mockToolActivityRegistry[key];
  }
});

function registerMathCalculateActivity(overrides: Partial<ToolActivity> = {}) {
  mockToolActivityRegistry.math_calculate = {
    createStep: () => ({
      kind: 'tool' as const,
      id: 'call-1',
      tool: 'math_calculate' as const,
    }),
    parsePersistedResult: (raw) => parseGenericPersistedToolResult<ToolResult>(raw),
    ...overrides,
  };
}

describe('createAiActivityCollector', () => {
  it('accumulates provider reasoning summaries without exposing raw analysis', () => {
    const collector = createAiActivityCollector();
    const part = { itemId: 'item-1', summaryIndex: 0 };

    expect(collector.addReasoningSummary('First part. ', part)).toBe(true);
    expect(collector.addReasoningSummary('Second part.', part)).toBe(true);
    expect(collector.getSteps()).toEqual([]);
  });

  it('adds the full reasoning summary before the done step', () => {
    const collector = createAiActivityCollector();

    collector.addReasoningSummary('Reasoning trace.', { itemId: 'item-1', summaryIndex: 0 });

    expect(collector.finish()).toBe(true);
    expect(collector.getSteps()).toEqual([
      { kind: 'analysis-summary', content: 'Reasoning trace.' },
      { kind: 'done' },
    ]);
  });

  it('concatenates without a separator when no part identity is given (e.g. Gemini, persisted summaries)', () => {
    const collector = createAiActivityCollector();

    collector.addReasoningSummary('First part.');
    collector.addReasoningSummary(' Second part.');

    collector.finish();
    expect(collector.getSteps()).toEqual([
      { kind: 'analysis-summary', content: 'First part. Second part.' },
      { kind: 'done' },
    ]);
  });

  it('inserts a separator between distinct reasoning summary parts', () => {
    const collector = createAiActivityCollector();

    collector.addReasoningSummary('First part.', { itemId: 'item-1', summaryIndex: 0 });
    collector.addReasoningSummary(' continued.', { itemId: 'item-1', summaryIndex: 0 });
    collector.addReasoningSummary('Second part.', { itemId: 'item-1', summaryIndex: 1 });

    collector.finish();
    expect(collector.getSteps()).toEqual([
      { kind: 'analysis-summary', content: 'First part. continued.\n\nSecond part.' },
      { kind: 'done' },
    ]);
  });

  it('does not add a reasoning summary step when no summary was received', () => {
    const collector = createAiActivityCollector();

    expect(collector.finish()).toBe(false);
    expect(collector.getSteps()).toEqual([]);
  });

  it('starts, adds tool calls, applies results, and finishes', () => {
    const applyResult = vi.fn((step, result: MathCalculateToolSuccessResponse) => {
      return { ...step, result: result.result ?? undefined };
    });
    registerMathCalculateActivity({ applyResult });
    const collector = createAiActivityCollector();

    expect(collector.addToolCalls([toolCall])).toBe(true);
    expect(collector.getSteps()).toEqual([{ kind: 'tool', id: 'call-1', tool: 'math_calculate' }]);
    expect(collector.addToolResult('unknown', {})).toBe(false);
    expect(collector.addToolResult('call-1', { result: '42' } as ToolResult)).toBe(true);
    expect(applyResult).toHaveBeenCalledWith(
      { kind: 'tool', id: 'call-1', tool: 'math_calculate' },
      { result: '42' },
    );
    expect(collector.finish()).toBe(true);
    expect(collector.finish()).toBe(true);
    expect(collector.getSteps()).toEqual([
      { kind: 'tool', id: 'call-1', tool: 'math_calculate', result: '42' },
      { kind: 'done' },
      { kind: 'done' },
    ]);
  });

  it('hides retrieved file names when configured for shared chats', () => {
    const retrieveFileCall: ToolCall = {
      id: 'call-file',
      name: 'retrieve_entire_file',
      arguments: '{"fileName":"private.pdf"}',
    };
    mockToolActivityRegistry.retrieve_entire_file = {
      createStep: (call: ToolCall) => ({
        kind: 'tool' as const,
        id: call.id,
        tool: 'retrieve_entire_file' as const,
        detail: 'private.pdf',
      }),
      parsePersistedResult: (raw) => parseGenericPersistedToolResult<ToolResult>(raw),
    };

    const defaultCollector = createAiActivityCollector();
    const sharedCollector = createAiActivityCollector({ hideSensitiveDetails: true });

    defaultCollector.addToolCalls([retrieveFileCall]);
    sharedCollector.addToolCalls([retrieveFileCall]);

    expect(defaultCollector.getSteps()[0]).toMatchObject({
      kind: 'tool',
      id: 'call-file',
      tool: 'retrieve_entire_file',
      detail: 'private.pdf',
    });
    expect(sharedCollector.getSteps()[0]).toMatchObject({
      kind: 'tool',
      id: 'call-file',
      tool: 'retrieve_entire_file',
    });
    const sharedStep = sharedCollector.getSteps()[0];
    expect(sharedStep?.kind === 'tool' ? sharedStep.detail : undefined).toBeUndefined();
  });

  it('skips applyResult for ToolErrorResult-shaped results', () => {
    const applyResult = vi.fn((step, result: MathCalculateToolSuccessResponse) => {
      return { ...step, result: result.result ?? undefined };
    });
    registerMathCalculateActivity({ applyResult });
    const collector = createAiActivityCollector();

    collector.addToolCalls([toolCall]);
    expect(collector.addToolResult('call-1', { error: 'Invalid tool arguments' })).toBe(true);
    expect(applyResult).not.toHaveBeenCalled();
    expect(collector.getSteps()).toEqual([{ kind: 'tool', id: 'call-1', tool: 'math_calculate' }]);
  });

  it('still applies the result when `error` is present but falsy (e.g. a stale `error: null`)', () => {
    const applyResult = vi.fn((step, result: MathCalculateToolSuccessResponse) => {
      return { ...step, result: result.result ?? undefined };
    });
    registerMathCalculateActivity({ applyResult });
    const collector = createAiActivityCollector();

    collector.addToolCalls([toolCall]);
    expect(collector.addToolResult('call-1', { result: '4', error: null } as never)).toBe(true);
    expect(applyResult).toHaveBeenCalledWith(
      { kind: 'tool', id: 'call-1', tool: 'math_calculate' },
      { result: '4', error: null },
    );
    expect(collector.getSteps()).toEqual([
      { kind: 'tool', id: 'call-1', tool: 'math_calculate', result: '4' },
    ]);
  });

  it('leaves the step unenriched when applyResult throws on a malformed result', () => {
    const applyResult = vi.fn(() => {
      throw new Error('malformed persisted result');
    });
    registerMathCalculateActivity({ applyResult });
    const collector = createAiActivityCollector();

    collector.addToolCalls([toolCall]);
    expect(collector.addToolResult('call-1', {})).toBe(true);
    expect(collector.getSteps()).toEqual([{ kind: 'tool', id: 'call-1', tool: 'math_calculate' }]);
  });

  it('ignores calls without registered activity and handles activity without result enrichment', () => {
    const collector = createAiActivityCollector();
    expect(collector.addToolCalls([toolCall])).toBe(false);
    expect(collector.addToolResult('call-1', {})).toBe(false);
    expect(collector.finish()).toBe(false);
    expect(collector.getSteps()).toEqual([]);

    registerMathCalculateActivity({ applyResult: undefined });
    const noResultCollector = createAiActivityCollector();
    expect(noResultCollector.addToolCalls([toolCall])).toBe(true);
    expect(noResultCollector.addToolResult('call-1', {})).toBe(true);
    expect(noResultCollector.finish()).toBe(true);
  });

  it('publishes tool completion when an activity result is unchanged', () => {
    registerMathCalculateActivity({ applyResult: (step) => step });
    const collector = createAiActivityCollector();
    collector.addToolCalls([toolCall]);
    expect(collector.addToolResult('call-1', {})).toBe(true);
    expect(collector.getSteps()).toHaveLength(1);
  });
});
