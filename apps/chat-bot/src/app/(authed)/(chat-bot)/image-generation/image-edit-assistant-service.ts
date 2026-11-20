import { generateTextWithBilling } from '@ais-chat/ai-core';
import { dbGetFederalStateWithApiKeyIdWithResult } from '@shared/db/functions/federal-state';
import { logError } from '@shared/logging';
import sharp from 'sharp';

import { getAuxiliaryModel } from '@/app/api/utils/utils';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 2000;
const MAX_PROMPT_LENGTH = 2000;
const MAX_IMAGE_BYTES = 20_000_000;

// Only fetch from the configured S3 host to prevent SSRF
function isAllowedImageUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    // Allow localhost for local dev (MinIO) and any non-private hostname in prod
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivate =
      hostname === '0.0.0.0' ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname === '169.254.169.254' ||
      // IPv6 loopback and private ranges
      hostname === '[::1]' ||
      /^\[fe[89ab][0-9a-f]:/i.test(hostname) || // fe80::/10 link-local
      /^\[fc[0-9a-f]{2}:/i.test(hostname) || // fc00::/7 ULA
      /^\[fd[0-9a-f]{2}:/i.test(hostname); // fc00::/7 ULA (fd range)
    return isLocal || !isPrivate;
  } catch {
    return false;
  }
}

// Resize to max 512px and convert to JPEG for a small payload (vision models don't need full res)
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  if (!isAllowedImageUrl(url)) {
    logError('Blocked disallowed image URL for vision', { url });
    return null;
  }
  try {
    const response = await fetch(url, { redirect: 'error' });
    if (!response.ok) return null;
    if (!response.headers.get('content-type')?.startsWith('image/')) return null;
    const raw = await response.arrayBuffer();
    if (raw.byteLength > MAX_IMAGE_BYTES) return null;
    const buffer = Buffer.from(raw);
    const resized = await sharp(buffer)
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch (err) {
    logError('Failed to fetch/resize image for vision', err);
    return null;
  }
}

function sanitize(text: string, maxLength: number): string {
  return text.replace(/[<>]/g, '').slice(0, maxLength);
}

function buildSystemPrompt(originalPrompt: string) {
  const safe = sanitize(originalPrompt, MAX_PROMPT_LENGTH);
  return `Du bist ein Bildbearbeitungs-Assistent. Das aktuelle Bild wurde mit folgendem englischen Prompt erstellt:

<original_prompt>${safe}</original_prompt>

Deine Aufgabe: Hilf dem Nutzer, das Bild durch Änderungen am Prompt zu verbessern oder zu variieren.
- Frage zuerst kurz, was geändert werden soll (Stil, Farben, Stimmung, Details, Perspektive…)
- Stelle ggf. 1 Rückfrage für mehr Klarheit
- Biete konkrete Variationen als Auswahloptionen an (OPTIONS: A | B | C)
- Erstelle dann einen verbesserten Prompt in zwei Versionen:

FINAL_PROMPT: [neuer englischer Bildprompt für die Generierung]
DISPLAY_PROMPT: [deutsche Beschreibung: was auf dem neuen Bild zu sehen sein wird]

Antworte immer kurz und freundlich auf Deutsch – außer in FINAL_PROMPT selbst.`;
}

export async function chatWithImageEditAssistant({
  messages,
  originalPrompt,
  imageUrl,
  federalStateId,
}: {
  messages: AssistantMessage[];
  originalPrompt: string;
  imageUrl?: string;
  federalStateId: string;
}): Promise<string> {
  const [[error, federalState], auxiliaryModel] = await Promise.all([
    dbGetFederalStateWithApiKeyIdWithResult({ federalStateId }),
    getAuxiliaryModel(federalStateId),
  ]);

  if (error !== null) throw new Error(error.message);
  if (!federalState.apiKeyId) throw new Error('Federal state has no API key assigned');

  const supportsVision =
    imageUrl !== undefined &&
    auxiliaryModel.supportedImageFormats !== null &&
    (auxiliaryModel.supportedImageFormats?.length ?? 0) > 0;

  const coreMessages: Parameters<typeof generateTextWithBilling>[1] = [
    { role: 'system', content: buildSystemPrompt(originalPrompt) },
  ];

  if (supportsVision) {
    const dataUrl = await fetchImageAsDataUrl(imageUrl!);
    if (dataUrl) {
      coreMessages.push({
        role: 'user',
        content: 'Hier ist das aktuelle Bild:',
        attachments: [{ type: 'image', contentType: 'image/png', url: dataUrl }],
      });
    }
  }

  const safeMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_LENGTH) }));
  coreMessages.push(...safeMessages);

  const result = await generateTextWithBilling(
    auxiliaryModel.id,
    coreMessages,
    federalState.apiKeyId,
  );

  return result.text;
}
