import type { CalculatorResponse } from '@/app/api/chat/calculator';
import type { AiActivityToolStep } from '@/types/ai-activity';
import { decodeChatStreamEvent } from '@/utils/streaming';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { describe, expect, it, vi } from 'vitest';
import { createAiActivityStream } from './ai-activity-stream';
import { generalizeToolRegistration, type ToolRegistration } from './tools/types';

const toolCall: ToolCall = {
  id: 'call-1',
  name: 'math_calculate',
  arguments: '{}',
};

function createToolRegistry() {
  const registration = {
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
      applyResult: (step: AiActivityToolStep, result: CalculatorResponse) => ({
        ...step,
        result: result.result ?? undefined,
      }),
    },
  } satisfies ToolRegistration<CalculatorResponse>;

  return {
    math_calculate: generalizeToolRegistration(registration),
  };
}

function decodeUpdates(updates: string[]) {
  return updates.map((update) => decodeChatStreamEvent(update));
}

describe('createAiActivityStream', () => {
  it('defers reasoning updates until the stream is finished', () => {
    const updates: string[] = [];
    const activity = createAiActivityStream((update) => updates.push(update), {});

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
    const activity = createAiActivityStream((update) => updates.push(update), createToolRegistry());

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
    const activity = createAiActivityStream((update) => updates.push(update), {});

    activity.onReasoningSummary('');
    activity.onToolCalls([toolCall]);
    activity.onToolResult({ toolCallId: toolCall.id, result: 'ignored' });
    activity.finish();

    expect(decodeUpdates(updates)).toEqual([]);
  });
});
