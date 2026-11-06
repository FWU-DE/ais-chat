'use client';

import { Button } from '@ui/components/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React from 'react';

import { useToast } from '@/components/common/toast';
import { cn } from '@/utils/tailwind';
import { inputFieldClassName } from '@/utils/tailwind/input';

import { getChatInfoByInviteCodeAction } from './actions';

export default function SharedChatLoginForm() {
  const [inviteCode, setInviteCode] = React.useState('');
  const toast = useToast();
  const router = useRouter();
  const t = useTranslations('custom-chat.shared');

  async function getChatByInviteCode(formattedInviteCode: string) {
    const result = await getChatInfoByInviteCodeAction(formattedInviteCode);
    if (result.success) return result.value;
    return undefined;
  }

  async function handleInviteCodeSubmit() {
    const formattedInviteCode = inviteCode.replace(/\s+/g, '').toUpperCase();
    const result = await getChatByInviteCode(formattedInviteCode);
    if (result !== undefined) {
      const { type, id, inviteCode } = result;
      const searchParams = new URLSearchParams({ inviteCode });
      const pathSegment = type === 'character' ? 'characters' : 'learning-scenarios';
      const route = `/ua/${pathSegment}/${id}/dialog?${searchParams.toString()}`;
      router.push(route);
      return;
    }

    toast.error(t('invalid-code-toast'));
  }

  return (
    <form className="flex flex-col gap-4 w-full">
      <h2 id="login-invite-code-label" className="text-3xl mb-2 font-medium text-center w-full">
        {t('join-code')}
      </h2>
      <input
        id="login-invite-code"
        aria-labelledby="login-invite-code-label"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleInviteCodeSubmit();
          }
        }}
        className={cn(inputFieldClassName, 'focus:border-primary placeholder:text-gray-300')}
      />
      <Button type="button" size="xl" onClick={handleInviteCodeSubmit} className="mt-4">
        {t('enter-chat')}
      </Button>
    </form>
  );
}
