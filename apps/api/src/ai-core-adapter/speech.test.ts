import { describe, expect, it, vi } from 'vitest';

const generateSpeechStreamByNameWithBilling = vi.hoisted(() => vi.fn());

vi.mock('@ais-chat/ai-core', () => ({ generateSpeechStreamByNameWithBilling }));

import {
  createSpeechAudioDeltaEvent,
  createSpeechAudioDoneEvent,
  createSpeechStream,
} from './speech';

describe('speech adapter', () => {
  it('passes generation arguments and options to ai-core', async () => {
    const result = { chunks: (async function* () {})(), mimeType: 'audio/mpeg' };
    generateSpeechStreamByNameWithBilling.mockResolvedValue(result);

    await expect(
      createSpeechStream({
        modelName: 'mock-speech',
        input: 'Hello',
        voice: 'alloy',
        apiKeyId: 'key-1',
      }),
    ).resolves.toBe(result);
    expect(generateSpeechStreamByNameWithBilling).toHaveBeenCalledWith(
      'mock-speech',
      'Hello',
      'alloy',
      'key-1',
    );
  });

  it('builds OpenAI speech SSE events', () => {
    expect(createSpeechAudioDeltaEvent(Buffer.from('audio'))).toEqual({
      type: 'speech.audio.delta',
      audio: 'YXVkaW8=',
    });
    expect(createSpeechAudioDoneEvent()).toEqual({
      type: 'speech.audio.done',
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    });
  });
});
