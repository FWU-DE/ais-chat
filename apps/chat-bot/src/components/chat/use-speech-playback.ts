'use client';

import { useToast } from '@/components/common/toast';
import { useTranslations } from 'next-intl';
import React from 'react';

export type SpeechPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Encapsulates the audio generation and playback lifecycle.
 * Generated audio is cached per text.
 */
export function useSpeechPlayback(text: string, generateSpeechFn: (text: string) => Promise<Blob>) {
  const toast = useToast();
  const tCommon = useTranslations('common');
  const [status, setStatus] = React.useState<SpeechPlaybackStatus>('idle');
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = React.useRef<string | null>(null);
  const cachedTextRef = React.useRef<string | null>(null);

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

  async function toggle() {
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
      const blob = await generateSpeechFn(text);

      if (audioUrlRef.current !== null) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
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

  return { status, toggle };
}
