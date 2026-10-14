'use client';

import Spinner from '@/components/icons/spinner';
import { PauseIcon, SpeakerSimpleHighIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { useSpeechPlayback } from '../hooks/use-speech-playback';

export default function SpeechButton({
  text,
  generateSpeechFn,
  isSpeechModelEnabled,
}: {
  text: string;
  generateSpeechFn: (text: string) => Promise<Blob>;
  isSpeechModelEnabled: boolean;
}) {
  const tCommon = useTranslations('common');
  const { status, handleClick } = useSpeechPlayback(text, generateSpeechFn);

  const label = status === 'playing' ? tCommon('pause-message') : tCommon('read-aloud');

  if (!isSpeechModelEnabled) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      disabled={status === 'loading'}
      aria-label={label}
      title={label}
      className="text-primary"
    >
      {status === 'loading' ? (
        <Spinner className="p-1 size-5" />
      ) : status === 'playing' ? (
        <PauseIcon className="size-4 text-primary" />
      ) : (
        <SpeakerSimpleHighIcon className="size-4 text-primary" />
      )}
    </Button>
  );
}
