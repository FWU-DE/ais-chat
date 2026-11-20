export function getImageContentType(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.startsWith('image/')) return normalized;

  switch (normalized) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

export async function streamToBase64(stream: NodeJS.ReadableStream): Promise<string> {
  const buffer = await streamToBuffer(stream);
  return buffer.toString('base64');
}

export async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : typeof chunk === 'string'
          ? Buffer.from(chunk)
          : Buffer.from(chunk as Uint8Array),
    );
  }

  return Buffer.concat(chunks);
}
