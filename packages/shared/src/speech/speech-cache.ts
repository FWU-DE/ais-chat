import { logError } from '@shared/logging';
import { valkey } from '@shared/valkey';
import { createHash } from 'node:crypto';

const SPEECH_PREVIEW_PREFIX = 'speech-preview:v1:';
const SPEECH_PREVIEW_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function buildKey(modelId: string, voice: string, text: string) {
  const textHash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return `${SPEECH_PREVIEW_PREFIX}${modelId}:${voice}:${textHash}`;
}

export async function getCachedSpeechPreview(
  modelId: string,
  voice: string,
  text: string,
): Promise<Buffer | undefined> {
  try {
    const cached = await valkey.getItemRaw<Buffer>(buildKey(modelId, voice, text));
    return cached ?? undefined;
  } catch (error) {
    logError('Failed to read cached speech preview, regenerating', error, { modelId, voice });
    return undefined;
  }
}

export async function setCachedSpeechPreview(
  modelId: string,
  voice: string,
  text: string,
  buffer: Buffer,
): Promise<void> {
  try {
    await valkey.setItemRaw(buildKey(modelId, voice, text), buffer, {
      ttl: SPEECH_PREVIEW_TTL_SECONDS,
    });
  } catch (error) {
    logError('Failed to cache speech preview', error, { modelId, voice });
  }
}
