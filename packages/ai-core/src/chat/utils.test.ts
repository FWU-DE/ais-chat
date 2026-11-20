import { describe, expect, it } from 'vitest';

import type { Message } from './types';
import { toOpenAIResponsesInput } from './utils';

describe('toOpenAIResponsesInput', () => {
  it('converts simple text messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    expect(toOpenAIResponsesInput(messages)).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('skips empty assistant messages from failed generations', () => {
    const messages: Message[] = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'Second question' },
    ];

    expect(toOpenAIResponsesInput(messages)).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'user', content: 'Second question' },
    ]);
  });

  it('keeps tool calls of an assistant message without text', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'web_search', arguments: '{"query":"AIS.chat"}' }],
      },
      { role: 'tool', content: 'result', toolCallId: 'call-1' },
    ];

    expect(toOpenAIResponsesInput(messages)).toEqual([
      {
        type: 'function_call',
        status: 'completed',
        arguments: '{"query":"AIS.chat"}',
        call_id: 'call-1',
        name: 'web_search',
      },
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: 'result',
        status: 'completed',
      },
    ]);
  });

  it('keeps empty user messages', () => {
    const messages: Message[] = [{ role: 'user', content: '' }];

    expect(toOpenAIResponsesInput(messages)).toEqual([{ role: 'user', content: '' }]);
  });
});
