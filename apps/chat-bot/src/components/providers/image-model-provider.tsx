'use client';

import type { LlmModel } from '@ais-chat/api-database';
import React from 'react';

type ImageModelsProviderProps = {
  models: LlmModel[];
  defaultImageModel: LlmModel | undefined;
  children: React.ReactNode;
};

type ImageModelsContextProps = {
  models: LlmModel[];
  selectedModel: LlmModel | undefined;
  setSelectedModel: (model: LlmModel) => void;
};

const ImageModelsContext = React.createContext<ImageModelsContextProps | undefined>(undefined);

function getFirstImageModel(models: LlmModel[]): LlmModel | undefined {
  return models.find((model) => model.priceMetadata.type === 'image');
}

export function ImageModelsProvider({
  models,
  children,
  defaultImageModel,
}: ImageModelsProviderProps) {
  const [selectedModel, setSelectedModel] = React.useState<LlmModel | undefined>(
    defaultImageModel ?? getFirstImageModel(models),
  );

  return (
    <ImageModelsContext value={{ models, selectedModel, setSelectedModel }}>
      {children}
    </ImageModelsContext>
  );
}

export function useImageModels(): ImageModelsContextProps {
  const maybeContext = React.useContext(ImageModelsContext);

  if (maybeContext === undefined) {
    throw new Error('useImageModels can only be used inside a ImageModelsProvider');
  }
  return maybeContext;
}
