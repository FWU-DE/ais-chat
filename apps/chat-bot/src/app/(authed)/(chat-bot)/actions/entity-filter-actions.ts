'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { getAssistantsByOverviewFilter } from '@shared/assistants/assistant-service';
import { requireTeacherRole } from '@shared/auth/authorization-service';
import { UserModel } from '@shared/auth/user-model';
import { getCharactersByOverviewFilter } from '@shared/characters/character-service';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import type { EntityType } from '@shared/entities/entity-types';
import { getFavoriteEntityIds, type WithFavorite } from '@shared/favorites/favorite-service';
import { FederalStateModel } from '@shared/federal-states/types';
import {
  enrichLearningScenarioWithPictureUrl,
  getLearningScenariosByOverviewFilter,
  type LearningScenarioWithImage,
} from '@shared/learning-scenarios/learning-scenario-service';
import type { OverviewFilter } from '@shared/overview-filter';

import { requireAuth } from '@/auth/requireAuth';

import { type AssistantWithImage, enrichAssistantsWithImage } from '../assistants/utils';
import { type CharacterWithImage, enrichCharactersWithImage } from '../characters/utils';

type FilterContext = {
  filter: OverviewFilter;
  user: UserModel;
  federalState: FederalStateModel;
};

function resolveFilter(filter: OverviewFilter, isSchoolSharingEnabled: boolean): OverviewFilter {
  return !isSchoolSharingEnabled && filter === 'school' ? 'mine' : filter;
}

// The favorites filter only returns favorites, so no extra lookup is needed.
async function getIsFavoritePredicate({
  entityType,
  filter,
  user,
}: {
  entityType: EntityType;
  filter: OverviewFilter;
  user: { id: string };
}): Promise<(entityId: string) => boolean> {
  if (filter === 'favorites') return () => true;
  const favoriteIds = new Set(await getFavoriteEntityIds({ entityType, user }));
  return (entityId) => favoriteIds.has(entityId);
}

async function getCharactersByFilter({
  filter,
  user,
  federalState,
}: FilterContext): Promise<WithFavorite<CharacterWithImage>[]> {
  requireTeacherRole(user.userRole);
  const effectiveFilter = resolveFilter(
    filter,
    federalState.featureToggles.isShareTemplateWithSchoolEnabled,
  );

  const [characters, isFavorite] = await Promise.all([
    getCharactersByOverviewFilter({
      filter: effectiveFilter,
      user: {
        id: user.id,
        schoolIds: user.schoolIds,
        federalStateId: federalState.id,
      },
    }),
    getIsFavoritePredicate({ entityType: 'character', filter: effectiveFilter, user }),
  ]);

  const enrichedCharacters = await enrichCharactersWithImage({
    characters: characters.filter((c) => c.name.trim() !== ''),
  });
  return enrichedCharacters.map((c) => ({ ...c, isFavorite: isFavorite(c.id) }));
}

async function getLearningScenariosByFilter({
  filter,
  user,
  federalState,
}: FilterContext): Promise<WithFavorite<LearningScenarioWithImage>[]> {
  requireTeacherRole(user.userRole);
  const effectiveFilter = resolveFilter(
    filter,
    federalState.featureToggles.isShareTemplateWithSchoolEnabled,
  );

  const [learningScenarios, isFavorite] = await Promise.all([
    getLearningScenariosByOverviewFilter({
      filter: effectiveFilter,
      user: {
        id: user.id,
        schoolIds: user.schoolIds,
        federalStateId: federalState.id,
      },
    }),
    getIsFavoritePredicate({ entityType: 'learningScenario', filter: effectiveFilter, user }),
  ]);

  const enrichedLearningScenarios = await enrichLearningScenarioWithPictureUrl({
    learningScenarios: learningScenarios.filter((s) => s.name.trim() !== ''),
  });
  return enrichedLearningScenarios.map((s) => ({ ...s, isFavorite: isFavorite(s.id) }));
}

async function getAssistantsByFilter({
  filter,
  user,
  federalState,
}: FilterContext): Promise<WithFavorite<AssistantWithImage>[]> {
  const effectiveFilter = resolveFilter(
    filter,
    federalState.featureToggles.isShareTemplateWithSchoolEnabled,
  );

  const [assistants, isFavorite] = await Promise.all([
    getAssistantsByOverviewFilter({
      filter: effectiveFilter,
      user: {
        id: user.id,
        schoolIds: user.schoolIds,
        federalStateId: federalState.id,
      },
    }),
    getIsFavoritePredicate({ entityType: 'assistant', filter: effectiveFilter, user }),
  ]);

  const enrichedAssistants = await enrichAssistantsWithImage({
    assistants: assistants.filter((a) => a.name.trim() !== '' && a.id !== HELP_MODE_ASSISTANT_ID),
  });
  return enrichedAssistants.map((a) => ({ ...a, isFavorite: isFavorite(a.id) }));
}

export async function getCharactersByFilterAction(filter: OverviewFilter) {
  const { user, federalState } = await requireAuth();
  return runServerAction(
    'getCharactersByFilterAction',
    getCharactersByFilter,
  )({ filter, user, federalState });
}

export async function getLearningScenariosByFilterAction(filter: OverviewFilter) {
  const { user, federalState } = await requireAuth();
  return runServerAction(
    'getLearningScenariosByFilterAction',
    getLearningScenariosByFilter,
  )({ filter, user, federalState });
}

export async function getAssistantsByFilterAction(filter: OverviewFilter) {
  const { user, federalState } = await requireAuth();
  return runServerAction(
    'getAssistantsByFilterAction',
    getAssistantsByFilter,
  )({ filter, user, federalState });
}
