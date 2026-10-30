export { getSpeechModelById } from '../models';
export { generateSpeechById } from './generate';
export { streamSpeechById } from './generate-stream';
export {
  constructGoogleSpeechGenerationFn,
  constructGoogleStreamingSpeechGenerationFn,
} from './providers/google';
export { constructGoogleCloudTtsStreamingSpeechGenerationFn } from './providers/google-cloud-tts';
export { PCM_STREAM_AUDIO_FORMAT } from './types';
export type {
  AudioFormat,
  SpeechGenerationFn,
  SpeechResponse,
  SpeechStreamGenerationFn,
  SpeechStreamResult,
  SpeechUsage,
} from './types';
