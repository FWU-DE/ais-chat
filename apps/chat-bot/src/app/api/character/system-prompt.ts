import type { ToolDefinition } from '@ais-chat/ai-core';
import { CharacterSelectModel } from '@shared/db/schema';

import {
  constructToolGuidelines,
  FORMAT_GUIDELINES,
  LANGUAGE_GUIDELINES,
} from '../utils/system-prompt';

export function constructCharacterSystemPrompt({
  character,
  activeToolDefinitions = [],
}: {
  character: CharacterSelectModel;
  activeToolDefinitions?: ToolDefinition[];
}) {
  return `Du bist ein Dialogpartner, der in einer Schule eingesetzt wird. Du verkörperst ${character.name}.
  
${LANGUAGE_GUIDELINES}
${constructToolGuidelines(activeToolDefinitions)}
${FORMAT_GUIDELINES}

Die folgenden Anweisungen wurden von der Lehrkraft erstellt und haben bei Widersprüchen immer Vorrang vor den allgemeinen Richtlinien.

${character.instructions?.trim() ? `### Anweisungen\n${character.instructions}\n` : ''}

${character.description?.trim() ? `### Beschreibung\n${character.description}\n` : ''}
Bitte antworte stets im Rahmen deiner Rolle als ${character.name}.`;
}

// Create the system prompt for determining the language of the character assistant
export function constructCharacterLanguageSystemPrompt({
  character,
}: {
  character: CharacterSelectModel;
}) {
  return `

## Kontext:
### Thema des Chats 
${character.name}

${character.description?.trim() ? `### Zweck des Dialogs\n${character.description}\n` : ''}
${character.instructions?.trim() ? `### Folgendes sollst du tun\n${character.instructions}\n` : ''}
`;
}
