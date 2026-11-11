import { getSpeechModelById } from '../models';
import { getStreamingSpeechGenerationFn } from './providers';
import { streamSpeechSegments } from './stream-segments';
import { preprocessSpeechText } from './text/preprocess';
import { splitSpeechText } from './text/split';
import type { SpeechStreamResult } from './types';

// Keeps each request well below the input limits of speech providers.
const MAX_SPEECH_SEGMENT_CHARS = 10000;

// Generous ceiling per segment (not just time-to-first-chunk), since long segments legitimately
// take longer to fully synthesize than the non-streaming SPEECH_TIMEOUT_MS.
const SPEECH_SEGMENT_MAX_DURATION_MS = 60_000;

export async function streamSpeechById({
  modelId,
  text,
  voice,
  abortSignal,
}: {
  modelId: string;
  text: string;
  voice: string;
  /** Aborted when the HTTP client disconnects, combined with an internal per-segment ceiling. */
  abortSignal?: AbortSignal;
}): Promise<SpeechStreamResult> {
  const model = await getSpeechModelById(modelId);
  const generateSpeechStream = getStreamingSpeechGenerationFn(model);

  return streamSpeechSegments({
    segments: splitSpeechText(preprocessSpeechText(text), MAX_SPEECH_SEGMENT_CHARS),
    voice,
    abortSignal,
    segmentTimeoutMs: SPEECH_SEGMENT_MAX_DURATION_MS,
    generateSpeechStream,
  });
}
