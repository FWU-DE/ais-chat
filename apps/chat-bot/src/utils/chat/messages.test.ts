import type { ConversationMessageModel } from '@shared/db/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseGenericPersistedToolResult } from '@/app/api/chat/tools/parse-persisted-tool-result';
import type { ToolActivity } from '@/app/api/chat/tools/types';

import { convertMessageModelToDisplayMessages, convertMessageModelToMessage } from './messages';

// Mutable so each test can register exactly the activity it needs.
const mockToolActivityRegistry: Record<string, ToolActivity> = vi.hoisted(() => ({}));

vi.mock('@/app/api/chat/build-tools', () => ({
  toolActivityRegistry: mockToolActivityRegistry,
}));

afterEach(() => {
  for (const key of Object.keys(mockToolActivityRegistry)) {
    delete mockToolActivityRegistry[key];
  }
});

function baseMessage(overrides: Partial<ConversationMessageModel>): ConversationMessageModel {
  return {
    id: 'message-1',
    content: '',
    conversationId: 'conversation-1',
    modelName: 'test-model',
    userId: 'user-1',
    role: 'assistant',
    orderNumber: 0,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    parameters: null,
    toolCalls: null,
    toolCallId: null,
    reasoningSummary: null,
    isLegacyAggregatedContent: false,
    ...overrides,
  };
}

function registerMathCalculateActivity(overrides: Partial<ToolActivity> = {}) {
  mockToolActivityRegistry.math_calculate = {
    createStep: (call) => ({
      kind: 'tool' as const,
      id: call.id,
      tool: 'math_calculate' as const,
    }),
    parsePersistedResult: (raw) => parseGenericPersistedToolResult(raw),
    ...overrides,
  };
}

describe('convertMessageModelToMessage', () => {
  it('marks the step as failed when a tool activity throws while parsing a persisted result', () => {
    registerMathCalculateActivity({
      parsePersistedResult: () => {
        throw new Error('malformed persisted result');
      },
    });

    const messages: ConversationMessageModel[] = [
      baseMessage({
        id: 'assistant-1',
        role: 'assistant',
        toolCalls: [{ id: 'call-1', name: 'math_calculate', arguments: '{}' }],
      }),
      baseMessage({
        id: 'tool-1',
        role: 'tool',
        content: '{}',
        toolCallId: 'call-1',
      }),
      baseMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    expect(() => convertMessageModelToMessage(messages)).not.toThrow();
    const result = convertMessageModelToMessage(messages);
    expect(result.find((message) => message.id === 'assistant-2')?.activitySteps).toEqual([
      { kind: 'tool', id: 'call-1', tool: 'math_calculate', failed: true },
      { kind: 'done' },
    ]);
  });

  it('leaves the step unenriched when a tool activity throws while applying a persisted result', () => {
    registerMathCalculateActivity({
      parsePersistedResult: (raw) => parseGenericPersistedToolResult(raw),
      applyResult: () => {
        throw new Error('malformed persisted result');
      },
    });

    const messages: ConversationMessageModel[] = [
      baseMessage({
        id: 'assistant-1',
        role: 'assistant',
        toolCalls: [{ id: 'call-1', name: 'math_calculate', arguments: '{}' }],
      }),
      baseMessage({
        id: 'tool-1',
        role: 'tool',
        content: '{}',
        toolCallId: 'call-1',
      }),
      baseMessage({ id: 'assistant-2', role: 'assistant' }),
    ];

    const result = convertMessageModelToMessage(messages);
    expect(result.find((message) => message.id === 'assistant-2')?.activitySteps).toEqual([
      { kind: 'tool', id: 'call-1', tool: 'math_calculate' },
      { kind: 'done' },
    ]);
  });
});

describe('convertMessageModelToDisplayMessages', () => {
  it('merges tool-call text for display while the LLM history keeps each text once', () => {
    const messages = [
      baseMessage({ id: 'user-1', role: 'user', content: 'Question', orderNumber: 0 }),
      baseMessage({
        id: 'tool-call-1',
        content: 'Let me check.',
        toolCalls: [{ id: 'call-1', name: 'math_calculate', arguments: '{}' }],
        orderNumber: 1,
      }),
      baseMessage({
        id: 'tool-result-1',
        role: 'tool',
        content: '{}',
        toolCallId: 'call-1',
        orderNumber: 2,
      }),
      baseMessage({ id: 'final-1', content: 'Answer.', orderNumber: 3 }),
    ];

    expect(convertMessageModelToDisplayMessages(messages).at(-1)?.content).toBe(
      'Let me check.\n\nAnswer.',
    );
    expect(convertMessageModelToMessage(messages).at(-1)?.content).toBe('Answer.');
  });
});
