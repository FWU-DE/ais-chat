import { describe, expect, it } from 'vitest';

import { type ChatMessage as Message } from '@/types/chat';

import { consolidateMessages } from './utils';

describe('consolidateMessages', () => {
  it('should consolidate consecutive messages with the same role', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello', id: '1' },
      { role: 'user', content: 'How are you?', id: '2' },
      { role: 'assistant', content: 'I am good', id: '3' },
      { role: 'assistant', content: 'How can I help?', id: '4' },
    ];

    const consolidated = consolidateMessages(messages);

    expect(consolidated).toHaveLength(2);
    expect(consolidated[0]?.content).toBe('Hello\n\nHow are you?');
    expect(consolidated[1]?.content).toBe('I am good\n\nHow can I help?');
  });

  it('should not consolidate messages with different roles', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello', id: '1' },
      { role: 'assistant', content: 'Hi there', id: '2' },
      { role: 'user', content: 'How are you?', id: '3' },
    ];

    const consolidated = consolidateMessages(messages);

    expect(consolidated).toHaveLength(3);
    expect(consolidated[0]?.content).toBe('Hello');
    expect(consolidated[1]?.content).toBe('Hi there');
    expect(consolidated[2]?.content).toBe('How are you?');
  });

  it('should handle empty message array', () => {
    const messages: Message[] = [];
    const consolidated = consolidateMessages(messages);
    expect(consolidated).toHaveLength(0);
  });

  it('should handle single message array', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello', id: '1' }];

    const consolidated = consolidateMessages(messages);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0]?.content).toBe('Hello');
  });

  it('should handle multiple consecutive messages of the same role', () => {
    const messages: Message[] = [
      { role: 'user', content: 'First', id: '1' },
      { role: 'user', content: 'Second', id: '2' },
      { role: 'user', content: 'Third', id: '3' },
      { role: 'assistant', content: 'Reply 1', id: '4' },
      { role: 'assistant', content: 'Reply 2', id: '5' },
    ];

    const consolidated = consolidateMessages(messages);

    expect(consolidated).toHaveLength(2);
    expect(consolidated[0]?.content).toBe('First\n\nSecond\n\nThird');
    expect(consolidated[1]?.content).toBe('Reply 1\n\nReply 2');
  });
});
