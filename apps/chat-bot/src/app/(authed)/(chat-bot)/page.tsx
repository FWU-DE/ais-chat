import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { getDefaultModelNameByFederalStateId } from '@shared/llm-models/llm-model-service';
import { generateUUID } from '@shared/utils/uuid';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { requireAuth } from '@/auth/requireAuth';
import Chat from '@/components/chat/chat';
import Logo from '@/components/common/logo';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { LlmModelsProvider } from '@/components/providers/llm-model-provider';
import { getRandomPromptSuggestions } from '@/utils/prompt-suggestions/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function Page() {
  const id = generateUUID();
  const { user, federalState } = await requireAuth();
  const userAndContext = {
    ...user,
    federalState,
  };

  const promptSuggestions = getRandomPromptSuggestions({
    userRole: userAndContext.userRole,
  });

  const models = await dbGetLlmModelsByFederalStateId({
    federalStateId: userAndContext.federalState.id,
  });
  const defaultModelName = await getDefaultModelNameByFederalStateId(federalState.id, models);

  const logoElement = <Logo logoPath={userAndContext.federalState.pictureUrls?.logo} />;

  return (
    <LlmModelsProvider
      key={id}
      models={models}
      initialModelName={userAndContext.lastUsedModel ?? defaultModelName}
      defaultModelName={defaultModelName}
    >
      <DefaultPageLayout
        layoutConfig={{
          layout: 'chat',
          headerConfig: {
            chatId: id,
            downloadConversationEnabled: false,
            userAndContext,
          },
        }}
      >
        <Chat
          id={id}
          initialMessages={[]}
          promptSuggestions={promptSuggestions}
          enableFileUpload={true}
          logoElement={logoElement}
        />
      </DefaultPageLayout>
    </LlmModelsProvider>
  );
}
