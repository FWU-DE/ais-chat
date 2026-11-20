import { PlusIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/common/toast';
import { useLlmModels } from '@/components/providers/llm-model-provider';

import { createNewLearningScenarioAction } from './actions';

export function CreateNewLearningScenarioButton() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('learning-scenarios');

  const { defaultModel } = useLlmModels();

  const maybeDefaultModelId = defaultModel?.id;

  async function handleNewLearningScenario() {
    if (!maybeDefaultModelId) {
      throw new Error('No default model found');
    }
    const scenario = await createNewLearningScenarioAction({ modelId: maybeDefaultModelId });
    if (scenario.success) {
      router.push(`/learning-scenarios/editor/${scenario.value.id}?create=true`);
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  }

  return (
    <Button
      type="button"
      onClick={handleNewLearningScenario}
      data-testid="learning-scenario-create-button"
    >
      <PlusIcon className="size-5" />
      {t('form.button-create')}
    </Button>
  );
}
