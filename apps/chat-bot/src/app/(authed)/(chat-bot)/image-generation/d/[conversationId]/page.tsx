import { dbGetConversationAndMessages } from '@shared/db/functions/chat';
import { dbGetRelatedFiles } from '@shared/db/functions/files';
import {
  getAvailableImageModelsForFederalState,
  getDefaultImageModel,
} from '@shared/image-generation/image-generation-service';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { requireAuth } from '@/auth/requireAuth';
import { ImageAspectRatioProvider } from '@/components/image-generation/image-aspect-ratio-provider';
import ImageGenerationChat from '@/components/image-generation/image-generation-chat';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import { ImageModelsProvider } from '@/components/providers/image-model-provider';
import { ImageStyleProvider } from '@/components/providers/image-style-provider';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('image-generation.page-titles');
  return {
    title: t('chat'),
  };
}

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function Page(props: PageProps) {
  const { conversationId } = await props.params;
  const { user, federalState } = await requireAuth();

  if (!federalState.featureToggles.isImageGenerationEnabled) {
    redirect('/');
  }

  const conversationObject = await dbGetConversationAndMessages({
    conversationId,
    userId: user.id,
  });

  if (conversationObject === undefined) {
    redirect('/image-generation');
  }

  const { messages } = conversationObject;

  // Get file mappings for the conversation
  const fileMapping = await dbGetRelatedFiles(conversationId);

  // Get available image models
  const imageModels = await getAvailableImageModelsForFederalState({
    federalStateId: federalState.id,
  });

  const reversedMessages = messages.slice().reverse();

  // Find the last used model or use the first available image model
  const lastUsedModelInChat = reversedMessages.find(
    (msg) => msg.modelName !== undefined,
  )?.modelName;
  const selectedModel =
    imageModels.find((model) => model.name === lastUsedModelInChat) ??
    (await getDefaultImageModel({ imageModels, federalStateId: federalState.id }));
  const lastUsedStyleInChat = reversedMessages.find(
    (msg) => msg.parameters?.imageStyle !== undefined,
  )?.parameters?.imageStyle;
  const defaultAspectRatio =
    reversedMessages.find((msg) => msg.parameters?.aspectRatio !== undefined)?.parameters
      ?.aspectRatio ?? 'quadratic';

  return (
    <ImageModelsProvider models={imageModels} defaultImageModel={selectedModel}>
      <ImageStyleProvider defaultImageStyle={lastUsedStyleInChat}>
        <ImageAspectRatioProvider defaultAspectRatio={defaultAspectRatio}>
          <DefaultPageLayout layoutConfig={{ layout: 'image' }}>
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-auto">
                <ImageGenerationChat
                  conversationId={conversationId}
                  initialMessages={messages}
                  fileMapping={fileMapping}
                />
              </div>
            </div>
          </DefaultPageLayout>
        </ImageAspectRatioProvider>
      </ImageStyleProvider>
    </ImageModelsProvider>
  );
}
