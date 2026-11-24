import { describe, expect, it, vi } from 'vitest';

import { AiGenerationError } from '../errors';
import { streamSpeechSegments } from './stream-segments';
import { MP3_MIME_TYPE, type SpeechStreamGenerationFn, type SpeechUsage } from './types';

type FakeSegment = { chunks: string[]; usage: SpeechUsage; error?: Error };

/** Fakes a provider that streams the configured chunks per input text and reports usage at the end. */
function createFakeProvider(segmentsByText: Record<string, FakeSegment>) {
  const generateSpeechStream = vi.fn<SpeechStreamGenerationFn>(async ({ text }) => {
    const segment = segmentsByText[text];
    if (!segment) throw new Error(`Unexpected text: ${text}`);
    const { chunks: parts, usage: segmentUsage, error } = segment;

    let resolveUsage: (usage: SpeechUsage) => void;
    const usage = new Promise<SpeechUsage>((resolve) => {
      resolveUsage = resolve;
    });

    async function* chunks() {
      try {
        for (const part of parts) {
          yield Buffer.from(part);
        }
        if (error) throw error;
      } finally {
        resolveUsage(segmentUsage);
      }
    }

    return { chunks: chunks(), usage, mimeType: MP3_MIME_TYPE };
  });
  return generateSpeechStream;
}

async function collect(chunks: AsyncGenerator<Buffer>): Promise<string[]> {
  const result: string[] = [];
  for await (const chunk of chunks) {
    result.push(chunk.toString());
  }
  return result;
}

describe('streamSpeechSegments', () => {
  it('streams all segments in order and sums their usage', async () => {
    const generateSpeechStream = createFakeProvider({
      first: { chunks: ['a1', 'a2'], usage: { characters: 5 } },
      second: { chunks: ['b1'], usage: { characters: 6 } },
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'second'],
      voice: 'alloy',
      segmentTimeoutMs: 1000,
      generateSpeechStream,
    });

    expect(await collect(result.chunks)).toEqual(['a1', 'a2', 'b1']);
    expect(await result.usage).toEqual({ characters: 11 });
    expect(result.mimeType).toBe(MP3_MIME_TYPE);
    expect(generateSpeechStream.mock.calls.map(([args]) => args.text)).toEqual(['first', 'second']);
    expect(generateSpeechStream.mock.calls.every(([args]) => args.voice === 'alloy')).toBe(true);
  });

  it('requests the next segment only after the previous one finished', async () => {
    const generateSpeechStream = createFakeProvider({
      first: { chunks: ['a1'], usage: { characters: 1 } },
      second: { chunks: ['b1'], usage: { characters: 1 } },
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'second'],
      voice: 'alloy',
      segmentTimeoutMs: 1000,
      generateSpeechStream,
    });

    expect(generateSpeechStream).toHaveBeenCalledTimes(1);
    await result.chunks.next();
    expect(generateSpeechStream).toHaveBeenCalledTimes(1);
    await result.chunks.next();
    expect(generateSpeechStream).toHaveBeenCalledTimes(2);
  });

  it('throws when there is nothing to synthesize', async () => {
    await expect(
      streamSpeechSegments({
        segments: [],
        voice: 'alloy',
        segmentTimeoutMs: 1000,
        generateSpeechStream: createFakeProvider({}),
      }),
    ).rejects.toThrow(AiGenerationError);
  });

  it('reports the failing segment after streaming the audio received so far', async () => {
    const generateSpeechStream = createFakeProvider({
      first: { chunks: ['a1'], usage: { characters: 5 } },
      second: { chunks: ['b1'], usage: { characters: 6 }, error: new Error('upstream broke') },
      third: { chunks: ['c1'], usage: { characters: 7 } },
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'second', 'third'],
      voice: 'alloy',
      segmentTimeoutMs: 1000,
      generateSpeechStream,
    });

    const received: string[] = [];
    await expect(async () => {
      for await (const chunk of result.chunks) {
        received.push(chunk.toString());
      }
    }).rejects.toThrow('Speech generation failed (segment 2/3): upstream broke');

    expect(received).toEqual(['a1', 'b1']);
    expect(generateSpeechStream).toHaveBeenCalledTimes(2);
    expect(await result.usage).toEqual({ characters: 11 });
  });

  it('reports a failing request of a later segment with its index', async () => {
    const generateSpeechStream = createFakeProvider({
      first: { chunks: ['a1'], usage: { characters: 5 } },
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'missing'],
      voice: 'alloy',
      segmentTimeoutMs: 1000,
      generateSpeechStream,
    });

    await expect(collect(result.chunks)).rejects.toThrow(
      'Speech generation failed (segment 2/2): Unexpected text: missing',
    );
    expect(await result.usage).toEqual({ characters: 5 });
  });

  it('applies the timeout to each segment separately', async () => {
    const generateSpeechStream = vi.fn<SpeechStreamGenerationFn>(async ({ abortSignal }) => {
      async function* chunks() {
        await new Promise((resolve) => setTimeout(resolve, 70));
        abortSignal.throwIfAborted();
        yield Buffer.from('chunk');
      }
      return {
        chunks: chunks(),
        usage: Promise.resolve({ characters: 1 }),
        mimeType: MP3_MIME_TYPE,
      };
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'second'],
      voice: 'alloy',
      segmentTimeoutMs: 100,
      generateSpeechStream,
    });

    // Together the segments take longer than the timeout, each on its own does not.
    expect(await collect(result.chunks)).toEqual(['chunk', 'chunk']);
  });

  it('turns a timeout into a descriptive error', async () => {
    const generateSpeechStream = vi.fn<SpeechStreamGenerationFn>(async ({ abortSignal }) => {
      async function* chunks() {
        yield Buffer.from('a1');
        await new Promise((_, reject) => {
          abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      return {
        chunks: chunks(),
        usage: Promise.resolve({ characters: 1 }),
        mimeType: MP3_MIME_TYPE,
      };
    });

    const result = await streamSpeechSegments({
      segments: ['first'],
      voice: 'alloy',
      segmentTimeoutMs: 20,
      generateSpeechStream,
    });

    await expect(collect(result.chunks)).rejects.toThrow(
      'Speech generation timed out after 20 ms (segment 1/1)',
    );
  });

  it('passes errors through unchanged when the caller aborted', async () => {
    const abortController = new AbortController();
    const abortError = new Error('aborted by client');
    const generateSpeechStream = vi.fn<SpeechStreamGenerationFn>(async () => {
      async function* chunks() {
        yield Buffer.from('a1');
        abortController.abort();
        throw abortError;
      }
      return {
        chunks: chunks(),
        usage: Promise.resolve({ characters: 1 }),
        mimeType: MP3_MIME_TYPE,
      };
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'second'],
      voice: 'alloy',
      abortSignal: abortController.signal,
      segmentTimeoutMs: 1000,
      generateSpeechStream,
    });

    await expect(collect(result.chunks)).rejects.toBe(abortError);
    expect(generateSpeechStream).toHaveBeenCalledTimes(1);
  });

  it('resolves the summed usage when the consumer stops early', async () => {
    const generateSpeechStream = createFakeProvider({
      first: { chunks: ['a1', 'a2'], usage: { characters: 5 } },
      second: { chunks: ['b1'], usage: { characters: 6 } },
    });

    const result = await streamSpeechSegments({
      segments: ['first', 'second'],
      voice: 'alloy',
      segmentTimeoutMs: 1000,
      generateSpeechStream,
    });

    await result.chunks.next();
    await result.chunks.return();

    expect(await result.usage).toEqual({ characters: 5 });
    expect(generateSpeechStream).toHaveBeenCalledTimes(1);
  });
});
