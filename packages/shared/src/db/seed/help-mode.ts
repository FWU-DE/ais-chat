import { HELP_MODE_ASSISTANT_ID } from '../const';
import { dbUpsertAssistant } from '../functions/assistants';
import { type AssistantInsertModel } from '../schema';

const hilfeModusGpt: AssistantInsertModel & { id: string } = {
  id: HELP_MODE_ASSISTANT_ID,
  name: 'Hilfe-Assistent',
  systemPrompt: '',
  userId: null,
  isGlobal: true,
  promptSuggestions: [],
  description: null,
  pictureId: null,
  instructions: null,
};

export async function insertHelpModeGpt({ skip = true }: { skip: boolean }) {
  if (skip) return;

  const result = await dbUpsertAssistant({ assistant: hilfeModusGpt });
  console.log('helpMode seed successful');
  return result;
}
