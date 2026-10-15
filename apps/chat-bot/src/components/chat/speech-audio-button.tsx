'use client';

import Spinner from '@/components/icons/spinner';
import { PauseIcon, SpeakerSimpleHighIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { useSpeechPlayback } from '../hooks/use-speech-playback';

/**
 * Audio button used in speech-only mode.
 */
export default function SpeechAudioButton({
  text,
  generateSpeechFn,
  isStreaming = false,
}: {
  text: string;
  generateSpeechFn: (text: string) => Promise<Blob>;
  isStreaming?: boolean;
}) {
  const tCommon = useTranslations('common');
  const { status, handleClick } = useSpeechPlayback(text, generateSpeechFn);

  const isLoading = isStreaming || status === 'loading';
  const label = status === 'playing' ? tCommon('pause-audio') : tCommon('listen-to-answer');

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={label}
      title={label}
      className="w-fit"
      data-testid="speech-audio-button"
    >
      {isLoading ? (
        <Spinner className="p-1 size-5" />
      ) : status === 'playing' ? (
        <PauseIcon className="size-5" />
      ) : (
        <SpeakerSimpleHighIcon className="size-5" />
      )}
      {label}
    </Button>
  );
}
