import { generateUUID } from '@shared/utils/uuid';
import { notFound } from 'next/navigation';
import Chat from '@/components/chat/chat';
import Logo from '@/components/common/logo';
import { requireAuth } from '@/auth/requireAuth';
import { getAvatarPictureUrl } from '@shared/files/fileService';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import { parseSearchParams } from '@/utils/parse-search-params';
import { z } from 'zod';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { getLearningScenarioForChatSession } from '@shared/learning-scenarios/learning-scenario-service';
import { type Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';
const searchParamsSchema = z.object({ model: z.string().optional() });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('learning-scenarios.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function Page(props: PageProps<'/learning-scenarios/d/[learningScenarioId]'>) {
  const { learningScenarioId } = await props.params;
  const searchParams = parseSearchParams(searchParamsSchema, await props.searchParams);

  const id = generateUUID();
  const { user, federalState } = await requireAuth();
  const userAndContext = {
    ...user,
    federalState,
  };

  const learningScenario = await getLearningScenarioForChatSession({
    learningScenarioId,
    user,
  }).catch(() => {
    notFound();
  });

  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: federalState.id,
  });
  const learningScenarioModel = models.find((m) => m.id === learningScenario.modelId)?.name;
  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);

  const currentModel =
    searchParams.model ?? learningScenarioModel ?? user.lastUsedModel ?? defaultModelName;

  const avatarPictureUrl = await getAvatarPictureUrl(learningScenario.pictureId);
  const logoElement = <Logo logoPath={userAndContext.federalState.pictureUrls?.logo} />;

  return (
    <LlmModelsProvider
      models={models}
      initialModelName={currentModel}
      defaultModelName={defaultModelName}
    >
      <DefaultPageLayout
        layoutConfig={{
          layout: 'chat',
          headerConfig: {
            chatId: id,
            title: learningScenario.name,
            downloadConversationEnabled: false,
            userAndContext,
          },
        }}
      >
        <Chat
          id={id}
          initialMessages={[]}
          learningScenario={learningScenario}
          imageSource={avatarPictureUrl}
          enableFileUpload={true}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
