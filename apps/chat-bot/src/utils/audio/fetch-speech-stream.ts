/** Posts a JSON body and returns the response body as a stream, for use as a `generateSpeechStreamFn`. */
export async function fetchSpeechStream(
  url: string,
  body: unknown,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error('Could not generate speech stream');
  }

  return response.body;
}
