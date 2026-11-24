'use client';

import { getTextModels } from '@shared/llm-models/llm-model-utils';
import { useTranslations } from 'next-intl';
import React from 'react';

import ModelSelect from '../common/model-select';
import { useLlmModels } from '../providers/llm-model-provider';

export default function SelectLlmModel() {
  const { models, selectedModel, setSelectedModel } = useLlmModels();
  const t = useTranslations('common');

  return (
    <ModelSelect
      models={getTextModels(models)}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      modelType="text"
      label={t('current-language-model')}
      noModelsLabel={t('no-language-model-available')}
      enableUrlParams={true}
    />
  );
}
