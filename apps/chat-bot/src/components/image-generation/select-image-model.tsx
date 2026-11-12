'use client';

import { useTranslations } from 'next-intl';
import React from 'react';

import ModelSelect from '../common/model-select';
import { useImageModels } from '../providers/image-model-provider';

export default function SelectImageModel() {
  const { models, selectedModel, setSelectedModel } = useImageModels();
  const t = useTranslations('image-generation');

  return (
    <ModelSelect
      models={models}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      modelType="image"
      label={t('image-generation-model')}
      noModelsLabel={t('no-model-available')}
      isStudent={false}
      enableUrlParams={false}
    />
  );
}
