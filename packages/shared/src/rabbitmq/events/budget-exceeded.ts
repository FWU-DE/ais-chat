import crypto from 'crypto';
import { MonthlyTokenBudgetExceededEventType } from '../schema';

type UserAndContext = {
  id: string;
  userRole: string;
  schoolIds?: string[];
  federalState: { id: string };
};

type ConversationModel = {
  id: string;
};

type LearningScenarioSelectModel = {
  id: string;
};

type CharacterSelectModel = {
  id: string;
};

function hashWithoutSalt(data: string) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

type CommonProps = {
  user: UserAndContext;
  anonymous: boolean;
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

export function constructTokenBudgetExceededEvent(
  props: FunctionProps,
): MonthlyTokenBudgetExceededEventType {
  return {
    event_type: 'monthly_token_budget_exceeded' as const,
    pseudonym_id: hashWithoutSalt(props.user.id),
    school_id: props.user.schoolIds?.[0] ?? '',
    federal_state: props.user.federalState.id,
    timestamp: new Date(),
    user_role: props.user.userRole,
  };
}
