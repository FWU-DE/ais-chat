'use client';

import { BrainIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui/components/tooltip';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { setConversationPersonalContextAction } from '@/app/(authed)/(chat-bot)/personal-context/actions';
import { useToast } from '@/components/common/toast';

/**
 * Lets the user switch the personal context off (or back on) for a single chat.
 */
export function PersonalContextToggle({
  conversationId,
  initialEnabled,
}: {
  conversationId: string;
  initialEnabled: boolean;
}) {
  const t = useTranslations('personal-context.chat-toggle');
  const toast = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !enabled;
    setEnabled(next);

    startTransition(async () => {
      const result = await setConversationPersonalContextAction({
        conversationId,
        enabled: next,
      });

      if (!result.success) {
        setEnabled(!next);
        toast.error(t('error'));
      }
    });
  }

  const label = enabled ? t('disable') : t('enable');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClick}
          disabled={isPending}
          aria-label={label}
          aria-pressed={enabled}
        >
          <BrainIcon
            weight={enabled ? 'fill' : 'regular'}
            className={enabled ? '' : 'opacity-50'}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
