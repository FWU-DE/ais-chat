import { ImageModelsProvider } from '@/components/providers/image-model-provider';
import { ImageStyleProvider } from '@/components/providers/image-style-provider';
import ImageGenerationChat from '@/components/image-generation/image-generation-chat';
import {
  getAvailableImageModelsForFederalState,
  getDefaultImageModel,
} from '@shared/image-generation/image-generation-service';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/auth/requireAuth';
import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ImageAspectRatioProvider } from '@/components/image-generation/image-aspect-ratio-provider';
import { generateUUID } from '@shared/utils/uuid';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('image-generation.page-titles');
  return {
    title: t('chat'),
  };
}

export default async function ImageGenerationPage() {
  const { federalState } = await requireAuth();

  if (!(federalState.featureToggles.isImageGenerationEnabled ?? false)) {
    redirect('/');
  }

  const imageModels = await getAvailableImageModelsForFederalState({
    federalStateId: federalState.id,
  });
  const selectedModel = await getDefaultImageModel({
    imageModels,
    federalStateId: federalState.id,
  });

  return (
    <ImageModelsProvider
      key={generateUUID()}
      models={imageModels}
      defaultImageModel={selectedModel}
    >
      <ImageStyleProvider>
        <ImageAspectRatioProvider>
          <DefaultPageLayout layoutConfig={{ layout: 'image' }}>
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-auto">
                <ImageGenerationChat />
              </div>
            </div>
          </DefaultPageLayout>
        </ImageAspectRatioProvider>
      </ImageStyleProvider>
    </ImageModelsProvider>
  );
}
