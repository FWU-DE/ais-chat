export type {
  SpeechGenerationFn,
  SpeechResponse,
  SpeechUsage,
  SpeechStreamGenerationFn,
  SpeechStreamResult,
} from './types';
export {
  constructGoogleSpeechGenerationFn,
  constructGoogleStreamingSpeechGenerationFn,
} from './providers/google';
export { generateSpeechById } from './generate';
export { streamSpeechById } from './generate-stream';
