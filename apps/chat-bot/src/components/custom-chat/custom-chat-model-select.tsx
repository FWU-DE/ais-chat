'use client';

import { LlmModelSelectModel } from '@shared/db/schema';
import { getFilteredTextModels } from '@shared/llm-models/llm-model-utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { useTranslations } from 'next-intl';

type CustomChatModelSelectProps = {
  models: LlmModelSelectModel[];
  selectedModelId: string | undefined;
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

export function CustomChatModelSelect({
  models,
  selectedModelId,
  onValueChange,
  disabled,
}: CustomChatModelSelectProps) {
  const t = useTranslations('custom-chat.model');

  if (!selectedModelId) {
    return <p>{t('no-models')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">{t('label')}</div>
      <div>
        <Select defaultValue={selectedModelId} onValueChange={onValueChange} disabled={disabled}>
          <SelectTrigger aria-label={t('label')} data-testid="model-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {getFilteredTextModels(models, true).map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
