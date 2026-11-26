import { generateTextWithBilling } from '@ais-chat/ai-core';
import { dbGetFederalStateWithApiKeyIdWithResult } from '@shared/db/functions/federal-state';

import { getAuxiliaryModel } from '@/app/api/utils/utils';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

const MAX_MESSAGES = 40;
const MAX_CONTENT_LENGTH = 2000;
const MAX_PROMPT_LENGTH = 2000;

const BASE_SYSTEM_PROMPT = `Du bist ein freundlicher Bildprompt-Assistent für Schülerinnen und Schüler. Deine Aufgabe ist es, sie Schritt für Schritt durch das Erstellen eines professionellen Bildprompts für KI-Bildgeneratoren (wie FLUX oder DALL-E) zu führen.

Stelle immer nur EINE kurze, prägnante Frage auf Deutsch. Arbeite dabei schrittweise diese Aspekte ab:
1. Hauptmotiv – Was oder wer soll auf dem Bild zu sehen sein?
2. Umgebung – Welcher Ort oder Hintergrund passt dazu?
3. Stil – Welchen visuellen Stil soll das Bild haben?
4. Stimmung & Licht – Welche Atmosphäre oder Beleuchtung soll das Bild vermitteln?
5. Details – Gibt es besondere Farben, Perspektiven oder Einzelheiten?

Wenn du Auswahlmöglichkeiten anbietest, liste sie am Ende deiner Nachricht in diesem Format:
OPTIONS: Option A | Option B | Option C

Sobald du genug Informationen hast (nach 4–5 Fragen), erstelle den Bildprompt. Gib ihn in zwei Versionen aus:
1. Einen detaillierten englischen Prompt für die Bildgenerierung (FINAL_PROMPT)
2. Eine verständliche deutsche Beschreibung für den Nutzer (DISPLAY_PROMPT)

Markiere beide exakt so (jede Zeile für sich, keine anderen Zeichen auf diesen Zeilen):
FINAL_PROMPT: [englischer Bildprompt für die KI-Generierung]
DISPLAY_PROMPT: [deutsche Beschreibung: was auf dem Bild zu sehen sein wird]

Der englische Prompt soll klar, visuell reichhaltig und für KI-Bildgeneratoren optimiert sein.
Antworte immer kurz und freundlich auf Deutsch – außer in FINAL_PROMPT selbst.`;

function buildSystemPrompt(initialPrompt?: string): string {
  if (!initialPrompt?.trim()) return BASE_SYSTEM_PROMPT;
  const safe = initialPrompt.trim().replace(/[<>]/g, '').slice(0, MAX_PROMPT_LENGTH);
  return `${BASE_SYSTEM_PROMPT}

Der Nutzer hat bereits folgenden Text in das Eingabefeld eingegeben: <existing_input>${safe}</existing_input>

Frage den Nutzer zu Beginn, ob du diesen bestehenden Text als Ausgangspunkt verwenden sollst – biete ihm die Wahl:
OPTIONS: Ja, bestehenden Text verwenden | Nein, neu beginnen
Wenn er "Ja" wählt, analysiere den bestehenden Text und stelle nur noch Fragen zu den fehlenden Aspekten. Wenn er "Nein" wählt, starte von vorne mit der ersten Frage.`;
}

export async function chatWithImageAssistant({
  messages,
  initialPrompt,
  federalStateId,
}: {
  messages: AssistantMessage[];
  initialPrompt?: string;
  federalStateId: string;
}): Promise<string> {
  const [[error, federalState], auxiliaryModel] = await Promise.all([
    dbGetFederalStateWithApiKeyIdWithResult({ federalStateId }),
    getAuxiliaryModel(federalStateId),
  ]);

  if (error !== null) throw new Error(error.message);
  if (!federalState.apiKeyId) throw new Error('Federal state has no API key assigned');

  const safeMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_LENGTH) }));
  const coreMessages = [
    { role: 'system' as const, content: buildSystemPrompt(initialPrompt) },
    ...safeMessages,
  ];

  const result = await generateTextWithBilling(
    auxiliaryModel.id,
    coreMessages,
    federalState.apiKeyId,
  );

  return result.text;
}
