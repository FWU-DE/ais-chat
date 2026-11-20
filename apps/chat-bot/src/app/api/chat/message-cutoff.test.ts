import { ConversationRole } from '@ais-chat/ai-core/chat/types';
import { describe, expect, it } from 'vitest';

import { type ChatMessage as Message } from '@/types/chat';

import { generateRandomString } from '../../../../e2e/utils/random';
import { groupIntoBlocks, limitChatHistory } from './utils';

// Helper function to create a message
function createMessage(role: ConversationRole, content: string): Message {
  return { role, content, id: generateRandomString(10) };
}

function createToolCallMessage(content: string): Message {
  return {
    role: 'assistant',
    content,
    id: generateRandomString(10),
    toolCalls: [{ id: 'call_1', name: 'search', arguments: '{}' }],
  };
}

function createToolResultMessage(content: string): Message {
  return {
    role: 'tool',
    content,
    id: generateRandomString(10),
    toolCallId: 'call_1',
  };
}

describe('groupIntoBlocks', () => {
  it('should group simple user/assistant pairs into blocks', () => {
    const messages: Message[] = [
      createMessage('user', 'hello'),
      createMessage('assistant', 'hi'),
      createMessage('user', 'question'),
      createMessage('assistant', 'answer'),
    ];

    const blocks = groupIntoBlocks(messages);
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.messages.length).toBe(2);
    expect(blocks[1]!.messages.length).toBe(2);
  });

  it('should keep tool call sequences in one block', () => {
    const messages: Message[] = [
      createMessage('user', 'search for X'),
      createToolCallMessage(''),
      createToolResultMessage('result data'),
      createMessage('assistant', 'I found X'),
    ];

    const blocks = groupIntoBlocks(messages);
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.messages.length).toBe(4);
  });

  it('should handle conversation starting with assistant/tool messages', () => {
    const messages: Message[] = [
      createMessage('assistant', 'Welcome!'),
      createMessage('user', 'hello'),
      createMessage('assistant', 'hi there'),
    ];

    const blocks = groupIntoBlocks(messages);
    expect(blocks.length).toBe(2);
    // First block is the orphaned assistant message
    expect(blocks[0]!.messages).toEqual([messages[0]]);
    // Second block starts at the user message
    expect(blocks[1]!.messages).toEqual(messages.slice(1));
  });
});

describe('limitChatHistory', () => {
  it('should return empty array for empty input', () => {
    const result = limitChatHistory([], 1000);
    expect(result).toEqual([]);
  });

  it('should merge consecutive same-role messages before grouping into blocks', () => {
    // Two consecutive user messages followed by assistant — consolidation merges them
    // into a single user message, producing one block instead of two
    const messages: Message[] = [
      createMessage('user', 'part 1'),
      createMessage('user', 'part 2'),
      createMessage('assistant', 'response'),
      createMessage('user', 'next question'),
      createMessage('assistant', 'next answer'),
    ];

    const result = limitChatHistory(messages, 5000);

    // After consolidation: [{user: "part 1\n\npart 2"}, {assistant: "response"}, {user: ...}, {assistant: ...}]
    // = 2 blocks, all fit within budget
    expect(result.length).toBe(4);
    expect(result[0]!.content).toBe('part 1\n\npart 2');
    expect(result[1]!.content).toBe('response');
    expect(result[2]!.content).toBe('next question');
    expect(result[3]!.content).toBe('next answer');
  });

  it('should keep only the last block when character limit is very small', () => {
    const messages: Message[] = [
      createMessage('user', generateRandomString(100)),
      createMessage('assistant', generateRandomString(100)),
      createMessage('user', generateRandomString(100)),
      createMessage('assistant', generateRandomString(100)),
      createMessage('user', generateRandomString(100)),
    ];

    const result = limitChatHistory(messages, 50);

    // Last block is the last user message (no assistant reply yet)
    expect(result).toEqual(messages.slice(4));
  });

  it('should include all messages if character limit allows it', () => {
    const messages: Message[] = [
      createMessage('user', generateRandomString(100)),
      createMessage('assistant', generateRandomString(100)),
      createMessage('user', generateRandomString(100)),
      createMessage('assistant', generateRandomString(100)),
    ];

    const result = limitChatHistory(messages, 500);

    expect(result.length).toBe(4);
    expect(result).toEqual(messages);
  });

  it('should include most recent blocks up to character limit', () => {
    const messages: Message[] = [
      createMessage('user', generateRandomString(100)),
      createMessage('assistant', generateRandomString(1000)),
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
    ];

    const result = limitChatHistory(messages, 250);

    // Should include last 2 blocks (50+50 + 50+50 = 200, fits in 250)
    expect(result).toEqual(messages.slice(2));
  });

  it('should never split a tool call sequence', () => {
    const messages: Message[] = [
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
      createMessage('user', generateRandomString(50)),
      createToolCallMessage(generateRandomString(50)),
      createToolResultMessage(generateRandomString(200)),
      createMessage('assistant', generateRandomString(50)),
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
    ];

    // Budget fits last block (100) but not the tool-call block (350)
    const result = limitChatHistory(messages, 150);

    // Should only include the last block, not split the tool-call block
    expect(result).toEqual(messages.slice(6));
  });

  it('should include tool call block when it fits entirely', () => {
    const messages: Message[] = [
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
      createMessage('user', generateRandomString(50)),
      createToolCallMessage(generateRandomString(50)),
      createToolResultMessage(generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
    ];

    // Block 1: user+assistant = 100 chars
    // Block 2: user+toolCall+toolResult+assistant = 200 chars
    // Block 3: user+assistant = 100 chars
    // Budget 350 fits block 3 (100) + block 2 (200) = 300
    const result = limitChatHistory(messages, 350);

    // Should include last 2 blocks (tool-call block + last block)
    expect(result).toEqual(messages.slice(2));
  });

  it('should keep multi-step tool call sequences in one block', () => {
    const messages: Message[] = [
      // First tool call block (will be cut off)
      createMessage('user', generateRandomString(50)),
      createToolCallMessage(generateRandomString(50)),
      createToolResultMessage(generateRandomString(200)),
      createMessage('assistant', generateRandomString(50)),
      // Second tool call block: user asks, model calls tool twice before responding
      createMessage('user', generateRandomString(50)),
      createToolCallMessage(generateRandomString(50)),
      createToolResultMessage(generateRandomString(50)),
      createToolCallMessage(generateRandomString(50)),
      createToolResultMessage(generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
      // Final simple turn
      createMessage('user', generateRandomString(50)),
      createMessage('assistant', generateRandomString(50)),
    ];

    // Block 1: user+toolCall+toolResult+assistant = 350 chars (too large to include)
    // Block 2: user+toolCall+toolResult+toolCall+toolResult+assistant = 300 chars
    // Block 3: user+assistant = 100 chars
    // Budget 450 fits block 3 (100) + block 2 (300) = 400, but not block 1
    const result = limitChatHistory(messages, 450);

    // Should include last 2 blocks, cutting off the first tool-call block entirely
    expect(result).toEqual(messages.slice(4));
  });
});
