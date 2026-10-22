export type {
  SpeechGenerationFn,
  SpeechResponse,
  SpeechUsage,
  SpeechStreamGenerationFn,
  SpeechStreamResult,
  AudioFormat,
} from './types';
export { PCM_STREAM_AUDIO_FORMAT } from './types';
export {
  constructGoogleSpeechGenerationFn,
  constructGoogleStreamingSpeechGenerationFn,
} from './providers/google';
export {
  constructGoogleCloudTtsStreamingSpeechGenerationFn,
  type GoogleCloudTtsAudioEncoding,
  type GoogleCloudTtsStreamResult,
} from './providers/google-cloud-tts';
export { generateSpeechById } from './generate';
export { streamSpeechById } from './generate-stream';
export { getSpeechModelById } from '../models';
