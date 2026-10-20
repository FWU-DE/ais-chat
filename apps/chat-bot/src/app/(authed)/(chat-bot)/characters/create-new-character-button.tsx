'use client';

import { useToast } from '@/components/common/toast';
import { useLlmModels } from '@/components/providers/llm-model-provider';
import { PlusIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createNewCharacterAction } from './actions';

export function CreateNewCharacterButton() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('characters');

  const { defaultModel } = useLlmModels();

  const maybeDefaultModelId = defaultModel?.id;

  async function handleNewCharacter() {
    const createResult = await createNewCharacterAction({ modelId: maybeDefaultModelId });
    if (createResult.success) {
      router.push(`/characters/editor/${createResult.value.id}?create=true`);
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  }

  return (
    <Button type="button" onClick={handleNewCharacter} data-testid="character-create-button">
      <PlusIcon className="size-5" aria-hidden="true" />
      {t('form.create-character')}
    </Button>
  );
}
