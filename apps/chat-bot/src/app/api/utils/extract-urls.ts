import type {
  AssistantSelectModel,
  CharacterSelectModel,
  LearningScenarioSelectModel,
} from '@shared/db/schema';

function sanitizeLinks(links: string[] | null | undefined): string[] {
  return links?.filter((link) => link !== '') ?? [];
}

/**
 * Collects attached URLs based on the conversation context.
 *
 * @param assistant The active assistant, if applicable.
 * @param character The active character, if applicable.
 * @param learningScenario The active learning scenario, if applicable.
 * @returns The aggregated URLs.
 */
export function extractUrls({
  assistant,
  character,
  learningScenario,
}: {
  assistant?: AssistantSelectModel;
  character?: CharacterSelectModel;
  learningScenario?: LearningScenarioSelectModel;
}): string[] {
  return sanitizeLinks([
    ...(assistant?.attachedLinks ?? []),
    ...(character?.attachedLinks ?? []),
    ...(learningScenario?.attachedLinks ?? []),
  ]);
}
