'use client';

import { getFilteredTextModels } from '@shared/llm-models/llm-model-utils';
import { useTranslations } from 'next-intl';
import React from 'react';

import ModelSelect from '../common/model-select';
import { useLlmModels } from '../providers/llm-model-provider';

type SelectLlmModelProps = {
  isStudent?: boolean;
};

export default function SelectLlmModel({ isStudent = false }: SelectLlmModelProps) {
  const { models, selectedModel, setSelectedModel } = useLlmModels();
  const t = useTranslations('common');

  return (
    <ModelSelect
      models={getFilteredTextModels(models)}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      modelType="text"
      label={t('current-language-model')}
      noModelsLabel={t('no-language-model-available')}
      isStudent={isStudent}
      enableUrlParams={true}
    />
  );
}
