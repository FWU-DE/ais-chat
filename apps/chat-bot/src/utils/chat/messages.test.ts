import type { ToolActivity } from '@/app/api/chat/tools/types';
import { parseGenericPersistedToolResult } from '@/app/api/chat/tools/parse-persisted-tool-result';
import type { ConversationMessageModel } from '@shared/db/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertMessageModelToMessage } from './messages';

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
  it('leaves the step unenriched when a tool activity throws while parsing a persisted result', () => {
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
      { kind: 'tool', id: 'call-1', tool: 'math_calculate' },
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
