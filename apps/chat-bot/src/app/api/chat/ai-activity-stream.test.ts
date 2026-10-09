import type { CalculatorResponse } from '@/app/api/chat/calculator';
import type { AiActivityToolStep } from '@/types/ai-activity';
import { TOOL_NAMES, type ToolName } from '@/types/tool-names';
import { decodeChatStreamEvent } from '@/utils/streaming';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { describe, expect, it, vi } from 'vitest';
import { createAiActivityStream } from './ai-activity-stream';
import type { ToolRegistration } from './tools/types';

const toolCall: ToolCall = {
  id: 'call-1',
  name: 'math_calculate',
  arguments: '{}',
};

function createStubRegistration<TName extends ToolName>(name: TName) {
  return {
    definition: { name, description: '', parameters: {} },
    handler: vi.fn(),
    activity: {
      createStep: (call: ToolCall) => ({ kind: 'tool' as const, id: call.id, tool: name }),
    },
  } as ToolRegistration<TName, unknown>;
}

function createFullToolRegistry() {
  const registration: ToolRegistration<typeof TOOL_NAMES.mathCalculate, CalculatorResponse> = {
    definition: { name: 'math_calculate', description: '', parameters: {} },
    handler: vi.fn(async (): Promise<CalculatorResponse> => ({
      status: 'success',
      result: '42',
      error: null,
    })),
    activity: {
      createStep: (call: ToolCall) => ({
        kind: 'tool' as const,
        id: call.id,
        tool: 'math_calculate' as const,
      }),
      applyResult: (step: AiActivityToolStep, result: unknown) => {
        const typed = result as CalculatorResponse;
        return { ...step, result: typed.result ?? undefined };
      },
    },
  };

  return {
    [TOOL_NAMES.mathCalculate]: registration,
    [TOOL_NAMES.webSearch]: createStubRegistration(TOOL_NAMES.webSearch),
    [TOOL_NAMES.webScraper]: createStubRegistration(TOOL_NAMES.webScraper),
    [TOOL_NAMES.mundoSearch]: createStubRegistration(TOOL_NAMES.mundoSearch),
    [TOOL_NAMES.retrieveEntireFile]: createStubRegistration(TOOL_NAMES.retrieveEntireFile),
    [TOOL_NAMES.retrieveTextChunks]: createStubRegistration(TOOL_NAMES.retrieveTextChunks),
  };
}

function decodeUpdates(updates: string[]) {
  return updates.map((update) => decodeChatStreamEvent(update));
}

describe('createAiActivityStream', () => {
  it('defers reasoning updates until the stream is finished', () => {
    const updates: string[] = [];
    const activity = createAiActivityStream(
      (update) => updates.push(update),
      createFullToolRegistry(),
    );

    activity.onReasoningSummary('First part. ');
    activity.onReasoningSummary('Second part.');

    expect(decodeUpdates(updates)).toEqual([]);

    activity.finish();

    expect(decodeUpdates(updates)).toEqual([
      {
        type: 'ai_activity',
        steps: [
          { kind: 'analysis-summary', content: 'First part. Second part.' },
          { kind: 'done' },
        ],
      },
    ]);
  });

  it('publishes tool calls and results while retaining the final summary', () => {
    const updates: string[] = [];
    const activity = createAiActivityStream(
      (update) => updates.push(update),
      createFullToolRegistry(),
    );

    activity.onToolCalls([toolCall]);
    activity.onToolResult({
      toolCallId: toolCall.id,
      result: { status: 'success', result: '42', error: null },
    });
    activity.onReasoningSummary('Done.');
    activity.finish();

    expect(decodeUpdates(updates)).toEqual([
      {
        type: 'ai_activity',
        steps: [{ kind: 'tool', id: 'call-1', tool: 'math_calculate', result: '42' }],
      },
      {
        type: 'ai_activity',
        steps: [
          { kind: 'tool', id: 'call-1', tool: 'math_calculate', result: '42' },
          { kind: 'analysis-summary', content: 'Done.' },
          { kind: 'done' },
        ],
      },
    ]);
  });

  it('does not publish empty or unregistered activity', () => {
    const updates: string[] = [];
    const activity = createAiActivityStream(
      (update) => updates.push(update),
      createFullToolRegistry(),
    );

    activity.onReasoningSummary('');
    activity.onToolCalls([toolCall]);
    activity.onToolResult({ toolCallId: toolCall.id, result: 'ignored' });
    activity.finish();

    expect(decodeUpdates(updates)).toEqual([]);
  });
});
