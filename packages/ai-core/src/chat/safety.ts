import { getTextModelById } from '../models';
import { checkInputSafety } from '../safety';
import { isChatImageAttachment } from './types';
import type { Message, ModelSelection } from './types';

export async function checkTextInputSafety({
  modelSelection,
  safetyModelName,
  messages,
  apiKeyId,
}: {
  modelSelection: ModelSelection;
  safetyModelName?: string;
  messages: Message[];
  apiKeyId: string;
}): Promise<void> {
  if (!safetyModelName) {
    return;
  }

  const selectedModels = await Promise.all(
    modelSelection.modelIds.map((modelId) => getTextModelById(modelId)),
  );
  if (!selectedModels.some((model) => model.safetyFilterEnabled)) {
    return;
  }

  const safetyMessages = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: (message.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: message.content,
      images: message.attachments?.filter(isChatImageAttachment),
    }));

  await checkInputSafety(safetyModelName, safetyMessages, apiKeyId);
}
