import { describe, expect, it } from 'vitest';

import { mergeToolCallTextIntoFinalMessages } from './merge-tool-call-text';

const toolCall = (id: string) => [{ id, name: 'search', arguments: '{}' }];

describe('mergeToolCallTextIntoFinalMessages', () => {
  it('prepends the texts of all tool-call messages of a turn to its final message', () => {
    const result = mergeToolCallTextIntoFinalMessages([
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'First.', toolCalls: toolCall('1') },
      { role: 'tool', content: '{}', toolCallId: '1' },
      { role: 'assistant', content: '', toolCalls: toolCall('2') },
      { role: 'tool', content: '{}', toolCallId: '2' },
      { role: 'assistant', content: 'Second.', toolCalls: toolCall('3') },
      { role: 'tool', content: '{}', toolCallId: '3' },
      { role: 'assistant', content: 'Final.', isLegacyAggregatedContent: false },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'No tools.', isLegacyAggregatedContent: false },
    ]);

    expect(result.map((message) => message.content)).toEqual([
      'Q1',
      'First.',
      '{}',
      '',
      '{}',
      'Second.',
      '{}',
      'First.\n\nSecond.\n\nFinal.',
      'Q2',
      'No tools.',
    ]);
  });

  it('keeps the tool-call text when the final message is empty after an abort', () => {
    const result = mergeToolCallTextIntoFinalMessages([
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'Looking it up.', toolCalls: toolCall('1') },
      { role: 'tool', content: '{}', toolCallId: '1' },
      { role: 'assistant', content: '', isLegacyAggregatedContent: false },
    ]);

    expect(result.at(-1)?.content).toBe('Looking it up.');
  });

  it('leaves legacy messages that already contain the aggregated text unchanged', () => {
    const result = mergeToolCallTextIntoFinalMessages([
      { role: 'user', content: 'Q' },
      { role: 'assistant', content: 'Looking it up.', toolCalls: toolCall('1') },
      { role: 'tool', content: '{}', toolCallId: '1' },
      {
        role: 'assistant',
        content: 'Looking it up.\n\nAnswer.',
        isLegacyAggregatedContent: true,
      },
    ]);

    expect(result.at(-1)?.content).toBe('Looking it up.\n\nAnswer.');
  });
});
