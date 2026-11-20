import { UserRole } from '@shared/db/schema';

import { getRandomElements } from '../array/array';
import { STUDENT_SUGGESTIONS, TEACHER_SUGGESTIONS } from './const';

export function getRandomPromptSuggestions({ userRole }: { userRole: UserRole }) {
  const promptSuggestions = getPromptSuggestionByUserRole({ userRole });

  return getRandomElements(promptSuggestions, 4);
}

function getPromptSuggestionByUserRole({ userRole }: { userRole: UserRole }) {
  if (userRole === 'student') {
    return STUDENT_SUGGESTIONS;
  }

  if (userRole === 'teacher') {
    return TEACHER_SUGGESTIONS;
  }

  return [];
}
