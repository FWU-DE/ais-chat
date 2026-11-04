'use client';

import React, { startTransition } from 'react';
import { type LlmModelSelectModel } from '@shared/db/schema';
import { useSearchParams } from 'next/navigation';
import { useCustomPathname } from '@/hooks/use-custom-pathname';
import { Badge } from './badge';
import { navigateWithoutRefresh } from '@/utils/navigation/router';
import { HeaderMainMenuItem } from '../layout/header-main-menu-item';
import { HeaderMenuItem } from '../layout/header-menu-item';
import { Separator } from '@ui/components/separator';
import { GreenLeafIcon } from '../icons/green-leaf-icon';

type ModelSelectProps = {
  models: LlmModelSelectModel[];
  selectedModel: LlmModelSelectModel | undefined;
  onModelChange: (model: LlmModelSelectModel) => void;
  modelType: 'text' | 'image';
  label: string;
  noModelsLabel: string;
  isStudent?: boolean;
  enableUrlParams?: boolean;
};

export default function ModelSelect({
  models,
  selectedModel,
  onModelChange,
  modelType,
  label,
  noModelsLabel,
  isStudent = false,
  enableUrlParams = false,
}: ModelSelectProps) {
  const pathname = useCustomPathname();
  const searchParams = useSearchParams();

  async function handleSelectModel(model: LlmModelSelectModel) {
    startTransition(async () => {
      setOptimisticModelId(model.name);
    });
    onModelChange(model);

    // Only update URL params for chat models, not image generation.
    // Use replaceState to update the URL without triggering a full navigation,
    // which would remount client components and lose chat state (input, messages).
    if (enableUrlParams) {
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.set('model', model.name);
      navigateWithoutRefresh(`${pathname}?${newSearchParams.toString()}`);
    }
  }

  const [optimisticModelId, setOptimisticModelId] = React.useOptimistic(selectedModel?.name);

  const currentSelectedModel =
    models.find((model) => model.name === optimisticModelId) || selectedModel;
  const isGreen =
    currentSelectedModel && modelType === 'text' && isGreenModel({ model: currentSelectedModel });
  const isNew = currentSelectedModel?.isNew ?? false;
  const selectableModels = models
    .filter((m) => m.priceMetadata.type === modelType)
    .filter((m) => !isStudent || !m.name.includes('mistral')) // students should not be able to select mistral models
    .filter((m) => m.id !== currentSelectedModel?.id);

  return (
    <>
      <HeaderMainMenuItem
        caption={label}
        triggerLabel={currentSelectedModel?.displayName ?? noModelsLabel}
        triggerAriaLabel={`Select ${modelType} Model Dropdown`}
        isDropdownEnabled={selectableModels.length > 0}
        mainMenuItemTestId={`main-menu-item-${modelType}-model-dropdown`}
        selectedMenuItemTestId={`main-menu-item-${modelType}-model-selected`}
        isNew={isNew}
        isGreen={isGreen}
      >
        {selectableModels.map((model) => {
          return (
            <React.Fragment key={model.id}>
              <HeaderMenuItem
                aria-label={`Select ${model.name} Model`}
                data-testid={`menu-item-${model.displayName}`}
                onClick={() => {
                  handleSelectModel(model);
                }}
              >
                <ModelSpan model={model} modelType={modelType} />
              </HeaderMenuItem>
              <Separator className="mx-2 border-b-0 last:hidden" />
            </React.Fragment>
          );
        })}
      </HeaderMainMenuItem>
    </>
  );
}

function isGreenModel({ model }: { model: LlmModelSelectModel }) {
  return model.priceMetadata.type === 'text' && model.priceMetadata.promptTokenPrice < 150; // in tenth of a cent
}

function ModelSpan({
  model,
  modelType,
}: {
  model: LlmModelSelectModel;
  modelType: 'text' | 'image';
}) {
  return (
    <div className="flex flex-col">
      <div className="flex gap-2 items-center">
        <span>{model.displayName}</span>
        {modelType === 'text' && isGreenModel({ model }) && <GreenLeafIcon />}
        {model.isNew && <Badge text="NEU" />}
      </div>
      {model.description && (
        <span className="text-sm hover:text-text-secondary">{model.description}</span>
      )}
    </div>
  );
}
