import { UserAndContext } from '@/auth/types';
import { hashWithoutSalt } from '@/utils/crypto';
import { CharacterSelectModel, LearningScenarioSelectModel } from '@shared/db/schema';
import { ConversationModel } from '@shared/db/types';
import { NewChatMessageEventType } from '../schema';

type CommonProps = {
  user: UserAndContext;
  anonymous: boolean;
  promptTokens: number;
  completionTokens: number;
  costsInCent: number;
  provider: string;
  modelName: string;
};

type FunctionProps =
  | ({
      conversation: ConversationModel;
    } & CommonProps)
  | ({
      sharedChat: LearningScenarioSelectModel;
    } & CommonProps)
  | ({
      character: CharacterSelectModel;
    } & CommonProps);

export function constructNewMessageEvent(props: FunctionProps): NewChatMessageEventType {
  const commonObjectProps = {
    event_type: 'new_chat_message' as const,
    school_id: props.user.schoolIds?.[0] ?? '',
    federal_state: props.user.federalState.id,
    provider: props.provider,
    model_name: props.modelName,
    cost_in_cent: props.costsInCent,
    timestamp: new Date(),
    user_role: props.anonymous ? 'anonymous' : props.user.userRole,
    input_tokens: props.promptTokens,
    output_tokens: props.completionTokens,
  };

  if ('conversation' in props) {
    return {
      chat_id: props.conversation.id,
      chat_type: props.conversation.characterId !== null ? 'character' : 'standard',
      pseudonym_id: hashWithoutSalt(props.anonymous ? props.conversation.id : props.user.id),
      ...commonObjectProps,
    };
  } else if ('sharedChat' in props) {
    return {
      chat_id: props.sharedChat.id,
      chat_type: 'classdialog',
      pseudonym_id: hashWithoutSalt(props.anonymous ? props.sharedChat.id : props.user.id),
      ...commonObjectProps,
    };
  } else {
    return {
      chat_id: props.character.id,
      chat_type: 'character',
      pseudonym_id: hashWithoutSalt(props.anonymous ? props.character.id : props.user.id),
      ...commonObjectProps,
    };
  }
}
