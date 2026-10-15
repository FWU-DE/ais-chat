import type { MathCalculateToolSuccessResponse } from '@/app/api/chat/tools/math-calculate-tool';
import { decodeChatStreamEvent } from '@/utils/streaming';
import type { ToolCall, ToolResult } from '@ais-chat/ai-core/chat/types';
import { describe, expect, it, vi } from 'vitest';
import { createAiActivityStream } from './ai-activity-stream';
import type { ToolActivity } from './tools/types';

const toolCall: ToolCall = {
  id: 'call-1',
  name: 'math_calculate',
  arguments: '{}',
};

vi.mock('./build-tools', () => ({
  toolActivityRegistry: {
    math_calculate: {
      createStep: (call: ToolCall) => ({
        kind: 'tool' as const,
        id: call.id,
        tool: 'math_calculate' as const,
      }),
      applyResult: (step, result: MathCalculateToolSuccessResponse) => ({
        ...step,
        result: result.result,
      }),
      parsePersistedResult: () => undefined,
    } satisfies ToolActivity<MathCalculateToolSuccessResponse>,
  },
}));

function decodeUpdates(updates: string[]) {
  return updates.map((update) => decodeChatStreamEvent(update));
}

describe('createAiActivityStream', () => {
  it('defers reasoning updates until the stream is finished', () => {
    const updates: string[] = [];
    const activity = createAiActivityStream((update) => updates.push(update));

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
    const activity = createAiActivityStream((update) => updates.push(update));

    activity.onToolCalls([toolCall]);
    activity.onToolResult({
      toolCallId: toolCall.id,
      result: { result: '42' } as ToolResult,
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
    const activity = createAiActivityStream((update) => updates.push(update));
    const unregisteredToolCall = { ...toolCall, name: 'not_a_real_tool' } as ToolCall;

    activity.onReasoningSummary('');
    activity.onToolCalls([unregisteredToolCall]);
    activity.onToolResult({ toolCallId: unregisteredToolCall.id, result: {} });
    activity.finish();

    expect(decodeUpdates(updates)).toEqual([]);
  });
});
