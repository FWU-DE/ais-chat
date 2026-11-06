export { generateSpeechById } from './generate';
export { streamSpeechById } from './generate-stream';
export {
  constructGoogleSpeechGenerationFn,
  constructGoogleStreamingSpeechGenerationFn,
} from './providers/google';
export type {
  AudioFormat,
  SpeechGenerationFn,
  SpeechResponse,
  SpeechStreamGenerationFn,
  SpeechStreamResult,
  SpeechUsage,
} from './types';
export { PCM_STREAM_AUDIO_FORMAT } from './types';
