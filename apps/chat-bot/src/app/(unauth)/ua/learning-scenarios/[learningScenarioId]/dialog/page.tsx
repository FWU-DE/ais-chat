import { dbGetLearningScenarioByIdAndInviteCode } from '@shared/db/functions/learning-scenario';
import { dbGetFederalStateByUserId } from '@shared/db/functions/school';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { getModelByIdOrFallback } from '@shared/llm-models/llm-model-service';
import { logError } from '@shared/logging';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import z from 'zod';

import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import LearningScenarioSharedChat from '@/components/shared-chat/learning-scenario-shared-chat';
import { DEFAULT_DESIGN_CONFIGURATION } from '@/db/const';
import { loadTranslations } from '@/i18n/load-translations';
import { resolveSharingLocale } from '@/i18n/sharing-locale';
import { parseSearchParams } from '@/utils/parse-search-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learning-scenarios.page-titles');
  return {
    title: t('chat-shared'),
  };
}

const searchParamsSchema = z.object({ inviteCode: z.string() });

export default async function Page(
  props: PageProps<'/ua/learning-scenarios/[learningScenarioId]/dialog'>,
) {
  const { learningScenarioId } = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);

  const learningScenario = await dbGetLearningScenarioByIdAndInviteCode({
    learningScenarioId,
    inviteCode: searchParams.inviteCode,
  });

  if (!learningScenario) {
    notFound();
  }

  const federalState = await dbGetFederalStateByUserId({ userId: learningScenario.startedBy });
  const model = federalState
    ? await getModelByIdOrFallback({
        modelId: learningScenario.modelId,
        federalStateId: federalState.id,
      })
    : undefined;

  if (!model) {
    logError(
      'No model available for shared learning scenario',
      new Error('No model available for shared learning scenario'),
      { learningScenarioId: learningScenario.id, federalStateId: federalState?.id },
    );
    notFound();
  }

  const avatarPictureUrl = await getAvatarPictureUrl(learningScenario.pictureId);

  const designConfiguration = federalState?.designConfiguration ?? DEFAULT_DESIGN_CONFIGURATION;
  const locale = await resolveSharingLocale({
    customChatVariant: 'learning-scenario',
    customChatId: learningScenario.id,
    sharingUserId: learningScenario.startedBy,
  });
  const messages = await loadTranslations(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LlmModelsProvider
        models={[model]}
        initialModelName={model.name}
        defaultModelName={model.name}
      >
        <ThemeProvider designConfiguration={designConfiguration}>
          <LearningScenarioSharedChat
            {...learningScenario}
            inviteCode={searchParams.inviteCode}
            avatarPictureUrl={avatarPictureUrl}
            isSpeechModelEnabled={
              federalState?.featureToggles?.isSpeechModelEnabled === true &&
              learningScenario.isSpeechEnabled
            }
          />
        </ThemeProvider>
      </LlmModelsProvider>
    </NextIntlClientProvider>
  );
}
