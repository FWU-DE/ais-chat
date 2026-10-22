export type GenerateSpeechStreamFn = (
  text: string,
  options: { signal: AbortSignal },
) => Promise<ReadableStream<Uint8Array>>;
