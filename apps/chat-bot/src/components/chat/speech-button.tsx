'use client';

import React from 'react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { SpeakerHighIcon, PauseIcon } from '@phosphor-icons/react';
import Spinner from '@/components/icons/spinner';
import { useToast } from '@/components/common/toast';
import { generateSpeechAction } from '@/app/api/chat/actions';
import { useFederalState } from '@/components/providers/federal-state-provider';

export default function SpeechButton({ text }: { text: string }) {
  const federalState = useFederalState();
  const toast = useToast();
  const tCommon = useTranslations('common');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const cachedTextRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  async function handleClick() {
    if (status === 'loading') {
      return;
    }

    if (status === 'playing') {
      audioRef.current?.pause();
      setStatus('paused');
      return;
    }

    // Resume the paused audio from its current position.
    if (status === 'paused' && audioRef.current !== null) {
      await playAudio(audioRef.current, false);
      return;
    }

    // Replay the cached audio without regenerating it.
    if (audioRef.current !== null && cachedTextRef.current === text) {
      await playAudio(audioRef.current, true);
      return;
    }

    setStatus('loading');
    try {
      const result = await generateSpeechAction({ text });
      if (!result.success) {
        toast.error(result.error.message);
        setStatus('idle');
        return;
      }

      const audio = new Audio(`data:audio/wav;base64,${result.value.audioBase64}`);
      audio.onended = () => setStatus('idle');
      audio.onerror = () => {
        toast.error(tCommon('read-aloud-error'));
        setStatus('idle');
      };
      audioRef.current = audio;
      cachedTextRef.current = text;
      await playAudio(audio, true);
    } catch {
      toast.error(tCommon('read-aloud-error'));
      setStatus('idle');
    }
  }

  async function playAudio(audio: HTMLAudioElement, restart: boolean) {
    try {
      if (restart) {
        audio.currentTime = 0;
      }
      await audio.play();
      setStatus('playing');
    } catch {
      toast.error(tCommon('read-aloud-error'));
      setStatus('idle');
    }
  }

  const label = status === 'playing' ? tCommon('pause-message') : tCommon('read-aloud');

  if (federalState?.featureToggles?.isSpeechModelEnabled !== true) {
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
        <PauseIcon className="size-5 text-primary" />
      ) : (
        <SpeakerHighIcon className="size-5 text-primary" />
      )}
    </Button>
  );
}
