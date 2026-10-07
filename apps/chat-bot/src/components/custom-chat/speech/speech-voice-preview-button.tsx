'use client';

import React from 'react';
import { Button } from '@ui/components/button';
import { PlayIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/icons/spinner';
import { useToast } from '@/components/common/toast';

export function SpeechVoicePreviewButton({ voice }: { voice: string }) {
  const t = useTranslations('custom-chat.speech');
  const tCommon = useTranslations('common');
  const toast = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current !== null) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  async function handleClick() {
    if (isLoading || isPlaying) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t('voice-preview-text'), voice }),
      });

      if (!response.ok) {
        throw new Error('Could not generate speech preview');
      }

      const blob = await response.blob();

      if (audioUrlRef.current !== null) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        toast.error(tCommon('read-aloud-error'));
        setIsPlaying(false);
      };
      audioRef.current = audio;
      await audio.play();
      setIsPlaying(true);
    } catch {
      toast.error(tCommon('read-aloud-error'));
    } finally {
      setIsLoading(false);
    }
  }

  const label = t('voice-preview-label');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleClick}
      disabled={isLoading || isPlaying || !voice}
      aria-label={label}
      title={label}
      className="text-primary"
    >
      {isLoading ? (
        <Spinner className="p-1 size-5" />
      ) : (
        <PlayIcon weight="fill" className="size-5 text-primary" />
      )}
    </Button>
  );
}
