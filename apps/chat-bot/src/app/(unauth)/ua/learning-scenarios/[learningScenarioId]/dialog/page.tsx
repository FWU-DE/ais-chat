import LearningScenarioSharedChat from '@/components/shared-chat/learning-scenario-shared-chat';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { DEFAULT_DESIGN_CONFIGURATION } from '@/db/const';
import { parseSearchParams } from '@/utils/parse-search-params';
import { dbGetLlmModelById } from '@shared/db/functions/llm-model';
import { dbGetFederalStateByUserId } from '@shared/db/functions/school';
import { dbGetLearningScenarioByIdAndInviteCode } from '@shared/db/functions/learning-scenario';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { notFound } from 'next/navigation';
import z from 'zod';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { resolveSharingLocale } from '@/i18n/sharing-locale';
import { loadTranslations } from '@/i18n/load-translations';

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

  const model = await dbGetLlmModelById({ modelId: learningScenario.modelId });

  if (!model) {
    notFound();
  }

  const avatarPictureUrl = await getAvatarPictureUrl(learningScenario.pictureId);

  const federalState = await dbGetFederalStateByUserId({ userId: learningScenario.startedBy });
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
            isSpeechModelEnabled={federalState?.featureToggles?.isSpeechModelEnabled === true}
          />
        </ThemeProvider>
      </LlmModelsProvider>
    </NextIntlClientProvider>
  );
}
