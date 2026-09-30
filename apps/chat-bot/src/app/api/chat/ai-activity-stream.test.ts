import { describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '@ais-chat/ai-core/chat/types';
import { decodeChatStreamEvent } from '@/utils/streaming';
import type { ToolRegistration } from './tools/types';
import { createAiActivityStream } from './ai-activity-stream';

const toolCall: ToolCall = {
  id: 'call-1',
  name: 'math_calculate',
  arguments: '{}',
};

function createToolRegistry() {
  return {
    math_calculate: {
      definition: { name: 'math_calculate', description: '', parameters: {} },
      handler: vi.fn(async () => ''),
      activity: {
        createStep: (call: ToolCall) => ({
          kind: 'tool' as const,
          id: call.id,
          tool: 'math_calculate' as const,
        }),
        applyResult: (
          step: { kind: 'tool'; id: string; tool: 'math_calculate' },
          result: string,
        ) => ({ ...step, result }),
      },
    },
  } satisfies Record<string, ToolRegistration>;
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

    expect(decodeUpdates(updates)).toEqual([
      { type: 'ai_activity', steps: [{ kind: 'analysis' }] },
    ]);

    activity.finish();

    expect(decodeUpdates(updates)).toEqual([
      { type: 'ai_activity', steps: [{ kind: 'analysis' }] },
      {
        type: 'ai_activity',
        steps: [
          { kind: 'analysis' },
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
    activity.onToolResult({ toolCallId: toolCall.id, result: '42' });
    activity.onReasoningSummary('Done.');
    activity.finish();

    expect(decodeUpdates(updates)).toEqual([
      { type: 'ai_activity', steps: [{ kind: 'analysis' }] },
      {
        type: 'ai_activity',
        steps: [{ kind: 'analysis' }, { kind: 'tool', id: 'call-1', tool: 'math_calculate' }],
      },
      {
        type: 'ai_activity',
        steps: [
          { kind: 'analysis' },
          { kind: 'tool', id: 'call-1', tool: 'math_calculate', result: '42' },
        ],
      },
      {
        type: 'ai_activity',
        steps: [
          { kind: 'analysis' },
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

    expect(decodeUpdates(updates)).toEqual([
      { type: 'ai_activity', steps: [{ kind: 'analysis' }] },
    ]);
  });
});
