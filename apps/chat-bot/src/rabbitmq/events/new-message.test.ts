import type { UserAndContext } from '@/auth/types';
import { hashWithoutSalt } from '@/utils/crypto';
import type { CharacterSelectModel, LearningScenarioSelectModel } from '@shared/db/schema';
import type { ConversationModel } from '@shared/db/types';
import { describe, expect, it } from 'vitest';
import { NewChatMessageEventSchema } from '../schema';
import { constructNewMessageEvent } from './new-message';

const user = {
  id: 'user-1',
  userRole: 'teacher',
  schoolIds: ['school-1'],
  federalState: { id: 'federal-state-1' },
} as UserAndContext;

const commonProps = {
  user,
  promptTokens: 11,
  completionTokens: 22,
  costsInCent: 33,
  provider: 'azure',
  modelName: 'gpt-4o-mini',
};

describe('constructNewMessageEvent', () => {
  it('reports the serving provider and model for a standard conversation', () => {
    const conversation = { id: 'conversation-1', characterId: null } as ConversationModel;

    const event = constructNewMessageEvent({ ...commonProps, anonymous: false, conversation });

    expect(NewChatMessageEventSchema.parse(event)).toMatchObject({
      event_type: 'new_chat_message',
      chat_id: 'conversation-1',
      chat_type: 'standard',
      pseudonym_id: hashWithoutSalt('user-1'),
      provider: 'azure',
      model_name: 'gpt-4o-mini',
      federal_state: 'federal-state-1',
      school_id: 'school-1',
      user_role: 'teacher',
      input_tokens: 11,
      output_tokens: 22,
      cost_in_cent: 33,
    });
  });

  it('pseudonymizes anonymous shared chats by the shared chat id', () => {
    const sharedChat = { id: 'scenario-1' } as LearningScenarioSelectModel;

    const event = constructNewMessageEvent({ ...commonProps, anonymous: true, sharedChat });

    expect(event).toMatchObject({
      chat_id: 'scenario-1',
      chat_type: 'classdialog',
      pseudonym_id: hashWithoutSalt('scenario-1'),
      user_role: 'anonymous',
      provider: 'azure',
      model_name: 'gpt-4o-mini',
    });
  });

  it('reports character chats with the character id', () => {
    const character = { id: 'character-1' } as CharacterSelectModel;

    const event = constructNewMessageEvent({ ...commonProps, anonymous: true, character });

    expect(event).toMatchObject({
      chat_id: 'character-1',
      chat_type: 'character',
      pseudonym_id: hashWithoutSalt('character-1'),
      provider: 'azure',
      model_name: 'gpt-4o-mini',
    });
  });
});
