import type { AssistantSelectModel, UserRole } from '@shared/db/schema';

export function prepareAssistantForView(
  assistant: AssistantSelectModel,
  userRole: UserRole,
): AssistantSelectModel {
  if (userRole === 'teacher') {
    return assistant;
  }

  return {
    ...assistant,
    didacticCommentary: '',
  };
}
