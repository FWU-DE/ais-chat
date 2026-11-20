import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { describe, expect, it } from 'vitest';

import { convertToAiCoreMessages } from './messages';

describe('convertToAiCoreMessages', () => {
  it('converts simple string-content messages', () => {
    const input: ChatCompletionMessageParam[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
  });

  it('maps developer role to system', () => {
    const input: ChatCompletionMessageParam[] = [
      { role: 'developer', content: 'Internal instruction' },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result[0]!.role).toBe('system');
    expect(result[0]!.content).toBe('Internal instruction');
  });

  it('filters out unsupported roles (tool, function)', () => {
    const input: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Hello' },
      { role: 'tool', content: 'tool result', tool_call_id: 'tc1' },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('user');
  });

  it('handles multi-part content with text parts', () => {
    const input: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
      },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result[0]!.content).toBe('First part\nSecond part');
  });

  it('extracts image attachments from image_url parts', () => {
    const input: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this' },
          { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
        ],
      },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result[0]!.content).toBe('Describe this');
    expect(result[0]!.attachments).toHaveLength(1);
    expect(result[0]!.attachments![0]).toEqual({
      type: 'image',
      url: 'https://example.com/photo.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('infers content type from data URL', () => {
    const dataUrl = 'data:image/webp;base64,UklGR...';
    const input: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: dataUrl } }],
      },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result[0]!.attachments![0]!.contentType).toBe('image/webp');
  });

  it('falls back to image/png for unknown image extensions', () => {
    const input: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.bmp' } }],
      },
    ];
    const result = convertToAiCoreMessages(input);
    expect(result[0]!.attachments![0]!.contentType).toBe('image/png');
  });

  it('returns empty array for empty input', () => {
    expect(convertToAiCoreMessages([])).toEqual([]);
  });
});
