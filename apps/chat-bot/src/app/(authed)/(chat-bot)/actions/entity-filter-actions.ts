'use server';

import { getAssistantsByOverviewFilter } from '@shared/assistants/assistant-service';
import { getCharactersByOverviewFilter } from '@shared/characters/character-service';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import type { EntityType } from '@shared/entities/entity-types';
import { getFavoriteEntityIds, type WithFavorite } from '@shared/favorites/favorite-service';
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

export async function getCharactersByFilterAction(
  filter: OverviewFilter,
): Promise<WithFavorite<CharacterWithImage>[]> {
  const { user, federalState } = await requireAuth();
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

export async function getLearningScenariosByFilterAction(
  filter: OverviewFilter,
): Promise<WithFavorite<LearningScenarioWithImage>[]> {
  const { user, federalState } = await requireAuth();
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

export async function getAssistantsByFilterAction(
  filter: OverviewFilter,
): Promise<WithFavorite<AssistantWithImage>[]> {
  const { user, federalState } = await requireAuth();
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
