'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/common/toast';

import { createNewAssistantAction } from './actions';

export default function CreateNewAssistantButton() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('assistants');

  async function handleNewGPT() {
    const createResult = await createNewAssistantAction({});
    if (createResult.success) {
      router.push(`/assistants/editor/${createResult.value.id}?create=true`);
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  }

  return (
    <Button type="button" onClick={handleNewGPT} data-testid="assistant-create-button">
      <PlusIcon className="size-5" />
      {t('create-button')}
    </Button>
  );
}
