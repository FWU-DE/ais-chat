import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSharedChatEntityMock: vi.fn(),
  dbGetSharedChatConversationMock: vi.fn(),
  dbGetSharedChatConversationMessagesMock: vi.fn(),
}));

vi.mock('./shared-chat-get-entity', () => ({
  getSharedChatEntity: mocks.getSharedChatEntityMock,
}));
vi.mock('@shared/db/functions/shared-chat-conversation', () => ({
  dbGetSharedChatConversation: mocks.dbGetSharedChatConversationMock,
  dbGetSharedChatConversationMessages: mocks.dbGetSharedChatConversationMessagesMock,
}));

import { getSharedChatDocument } from './shared-chat-document-service';

const request = {
  inviteCode: 'invite',
  entityType: 'character' as const,
  entityId: 'character-1',
  sharedSessionId: 'session-1',
  toolCallId: 'call-1',
};

function generateDocumentCall(content: string, id = 'call-1', name = 'generate_document') {
  return {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id, name, arguments: JSON.stringify({ format: 'pdf', title: 'Titel', content }) },
    ],
    toolCallId: null,
  };
}

function toolResult(result: unknown, toolCallId = 'call-1') {
  return { role: 'tool', content: JSON.stringify(result), toolCalls: null, toolCallId };
}

const createdResult = { status: 'created', fileName: 'Titel.pdf', format: 'pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSharedChatEntityMock.mockResolvedValue({
    id: 'character-1',
    isDeleted: false,
    suspended: false,
    expiredAt: new Date('2099-01-01'),
    manuallyStoppedAt: null,
  });
  mocks.dbGetSharedChatConversationMock.mockResolvedValue({ id: 'session-1' });
});

describe('getSharedChatDocument', () => {
  it('returns the document of a successful generate_document call', async () => {
    mocks.dbGetSharedChatConversationMessagesMock.mockResolvedValue([
      generateDocumentCall('# Hallo'),
      toolResult(createdResult),
    ]);

    await expect(getSharedChatDocument(request)).resolves.toEqual({
      markdown: '# Hallo',
      title: 'Titel',
    });
    expect(mocks.dbGetSharedChatConversationMock).toHaveBeenCalledWith({
      conversationId: 'session-1',
      inviteCode: 'invite',
      entityType: 'character',
      entityId: 'character-1',
    });
  });

  it('returns the schema-normalized content', async () => {
    mocks.dbGetSharedChatConversationMessagesMock.mockResolvedValue([
      generateDocumentCall('  # Hallo  '),
      toolResult(createdResult),
    ]);

    await expect(getSharedChatDocument(request)).resolves.toMatchObject({ markdown: '# Hallo' });
  });

  it('selects the call with the requested id', async () => {
    mocks.dbGetSharedChatConversationMessagesMock.mockResolvedValue([
      generateDocumentCall('# Eins', 'call-1'),
      toolResult(createdResult, 'call-1'),
      generateDocumentCall('# Zwei', 'call-2'),
      toolResult(createdResult, 'call-2'),
    ]);

    await expect(
      getSharedChatDocument({ ...request, toolCallId: 'call-2' }),
    ).resolves.toMatchObject({ markdown: '# Zwei' });
  });

  it.each([
    [
      'an unknown tool call id',
      [generateDocumentCall('# Hallo', 'call-2'), toolResult(createdResult, 'call-2')],
    ],
    [
      'a failed call',
      [generateDocumentCall('# Hallo'), toolResult({ error: 'Invalid arguments' })],
    ],
    ['a missing tool result', [generateDocumentCall('# Hallo')]],
    [
      'a tool result of another call',
      [generateDocumentCall('# Hallo'), toolResult(createdResult, 'call-2')],
    ],
    [
      'another tool',
      [generateDocumentCall('# Hallo', 'call-1', 'web_search'), toolResult(createdResult)],
    ],
    [
      'invalid tool call arguments',
      [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'generate_document', arguments: 'not json' }],
          toolCallId: null,
        },
        toolResult(createdResult),
      ],
    ],
    [
      'a call written by the user',
      [{ ...generateDocumentCall('# Hallo'), role: 'user' }, toolResult(createdResult)],
    ],
    ['no messages', []],
  ])('rejects %s', async (_name, messages) => {
    mocks.dbGetSharedChatConversationMessagesMock.mockResolvedValue(messages);

    await expect(getSharedChatDocument(request)).rejects.toThrow(
      'Document does not belong to this shared chat',
    );
  });

  it('rejects when the conversation does not exist', async () => {
    mocks.dbGetSharedChatConversationMock.mockResolvedValue(undefined);

    await expect(getSharedChatDocument(request)).rejects.toThrow(
      'Document does not belong to this shared chat',
    );
    expect(mocks.dbGetSharedChatConversationMessagesMock).not.toHaveBeenCalled();
  });

  it('rejects deleted and suspended shared chats', async () => {
    mocks.getSharedChatEntityMock.mockResolvedValue({
      id: 'character-1',
      isDeleted: true,
      suspended: false,
      expiredAt: new Date('2099-01-01'),
      manuallyStoppedAt: null,
    });

    await expect(getSharedChatDocument(request)).rejects.toThrow();
    expect(mocks.dbGetSharedChatConversationMock).not.toHaveBeenCalled();
  });
});
