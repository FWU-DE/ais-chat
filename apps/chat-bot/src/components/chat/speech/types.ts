export type GenerateSpeechStreamFn = (
  text: string,
  isInitialMessage: boolean,
  options: { signal: AbortSignal },
) => Promise<ReadableStream<Uint8Array>>;
