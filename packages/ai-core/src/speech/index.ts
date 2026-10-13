export type { SpeechGenerationFn, SpeechResponse, SpeechUsage } from './types';
export { constructGoogleSpeechGenerationFn } from './providers/google';
export { generateSpeechById } from './generate';
