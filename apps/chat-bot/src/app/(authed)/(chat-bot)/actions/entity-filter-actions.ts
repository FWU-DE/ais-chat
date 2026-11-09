'use server';

import { getAssistantsByOverviewFilter } from '@shared/assistants/assistant-service';
import { requireTeacherRole } from '@shared/auth/authorization-service';
import { getCharactersByOverviewFilter } from '@shared/characters/character-service';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import {
  enrichLearningScenarioWithPictureUrl,
  getLearningScenariosByOverviewFilter,
  type LearningScenarioWithImage,
} from '@shared/learning-scenarios/learning-scenario-service';
import type { OverviewFilter } from '@shared/overview-filter';

import { requireAuth } from '@/auth/requireAuth';

import { type AssistantWithImage, enrichAssistantsWithImage } from '../assistants/utils';
import { type CharacterWithImage, enrichCharactersWithImage } from '../characters/utils';

function resolveFilter(filter: OverviewFilter, isSchoolSharingEnabled: boolean): OverviewFilter {
  return !isSchoolSharingEnabled && filter === 'school' ? 'mine' : filter;
}

export async function getCharactersByFilterAction(
  filter: OverviewFilter,
): Promise<CharacterWithImage[]> {
  const { user, federalState } = await requireAuth();
  requireTeacherRole(user.userRole);
  const effectiveFilter = resolveFilter(
    filter,
    federalState.featureToggles.isShareTemplateWithSchoolEnabled,
  );

  const characters = await getCharactersByOverviewFilter({
    filter: effectiveFilter,
    user: {
      id: user.id,
      schoolIds: user.schoolIds,
      federalStateId: federalState.id,
    },
  });

  return enrichCharactersWithImage({ characters: characters.filter((c) => c.name.trim() !== '') });
}

export async function getLearningScenariosByFilterAction(
  filter: OverviewFilter,
): Promise<LearningScenarioWithImage[]> {
  const { user, federalState } = await requireAuth();
  requireTeacherRole(user.userRole);
  const effectiveFilter = resolveFilter(
    filter,
    federalState.featureToggles.isShareTemplateWithSchoolEnabled,
  );

  const learningScenarios = await getLearningScenariosByOverviewFilter({
    filter: effectiveFilter,
    user: {
      id: user.id,
      schoolIds: user.schoolIds,
      federalStateId: federalState.id,
    },
  });

  return enrichLearningScenarioWithPictureUrl({
    learningScenarios: learningScenarios.filter((s) => s.name.trim() !== ''),
  });
}

export async function getAssistantsByFilterAction(
  filter: OverviewFilter,
): Promise<AssistantWithImage[]> {
  const { user, federalState } = await requireAuth();
  requireTeacherRole(user.userRole);
  const effectiveFilter = resolveFilter(
    filter,
    federalState.featureToggles.isShareTemplateWithSchoolEnabled,
  );

  const assistants = await getAssistantsByOverviewFilter({
    filter: effectiveFilter,
    user: {
      id: user.id,
      schoolIds: user.schoolIds,
      federalStateId: federalState.id,
    },
  });

  return enrichAssistantsWithImage({
    assistants: assistants.filter((a) => a.name.trim() !== '' && a.id !== HELP_MODE_ASSISTANT_ID),
  });
}
