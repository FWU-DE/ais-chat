import type { AssistantSelectModel } from '@shared/db/schema';
import { describe, expect, it } from 'vitest';

import { prepareAssistantForView } from './assistant-view-access';

const assistant = {
  id: 'assistant-id',
  didacticCommentary: 'Teacher-only guidance',
} as AssistantSelectModel;

describe('prepareAssistantForView', () => {
  it('preserves commentary for teachers', () =>
    expect(prepareAssistantForView(assistant, 'teacher')).toBe(assistant));
  it('redacts commentary for students', () =>
    expect(prepareAssistantForView(assistant, 'student').didacticCommentary).toBe(''));
});
