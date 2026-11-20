'use client';

import { LlmModelSelectModel } from '@shared/db/schema';
import React from 'react';

type ImageModelsProviderProps = {
  models: LlmModelSelectModel[];
  defaultImageModel: LlmModelSelectModel | undefined;
  children: React.ReactNode;
};

type ImageModelsContextProps = {
  models: LlmModelSelectModel[];
  selectedModel: LlmModelSelectModel | undefined;
  setSelectedModel: (model: LlmModelSelectModel) => void;
};

const ImageModelsContext = React.createContext<ImageModelsContextProps | undefined>(undefined);

function getFirstImageModel(models: LlmModelSelectModel[]): LlmModelSelectModel | undefined {
  return models.find((model) => model.priceMetadata.type === 'image');
}

export function ImageModelsProvider({
  models,
  children,
  defaultImageModel,
}: ImageModelsProviderProps) {
  const [selectedModel, setSelectedModel] = React.useState<LlmModelSelectModel | undefined>(
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
