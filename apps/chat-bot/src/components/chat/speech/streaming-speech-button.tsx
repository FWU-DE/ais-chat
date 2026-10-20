'use client';

import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
import { PcmStreamPlayer } from '@/utils/audio/pcm-stream-player';
import { readableStreamToAsyncIterable } from '@/utils/audio/readable-stream-to-async-iterable';
import { PauseIcon, SpeakerHighIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

/**
 * Streaming counterpart of `SpeechButton`, rendered alongside it (see `message-actions.tsx`) so
 * the existing non-streaming read-aloud button keeps working unchanged while this one is
 * validated. v1 scope is play/pause only — no stop/seek/-10s/scrubbing yet, see
 * `PcmStreamPlayer` for the buffering design that keeps those additive later.
 */
export default function StreamingSpeechButton({
  text,
  generateSpeechStreamFn,
  isSpeechModelEnabled,
}: {
  text: string;
  generateSpeechStreamFn: (
    text: string,
    options: { signal: AbortSignal },
  ) => Promise<ReadableStream<Uint8Array>>;
  isSpeechModelEnabled: boolean;
}) {
  const toast = useToast();
  const tCommon = useTranslations('common');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const playerRef = React.useRef<PcmStreamPlayer | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  async function handleClick() {
    if (status === 'loading') {
      return;
    }

    if (status === 'playing') {
      playerRef.current?.pause();
      setStatus('paused');
      return;
    }

    if (status === 'paused') {
      playerRef.current?.resume();
      setStatus('playing');
      return;
    }

    setStatus('loading');
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const body = await generateSpeechStreamFn(text, { signal: abortController.signal });

      const player = new PcmStreamPlayer({
        onStateChange: (next) => {
          if (next === 'ended' || next === 'error') {
            playerRef.current?.dispose();
            playerRef.current = null;
            setStatus('idle');
            return;
          }
          setStatus(next);
        },
      });
      playerRef.current = player;

      await player.start(readableStreamToAsyncIterable(body));
    } catch {
      if (abortController.signal.aborted) {
        return;
      }
      toast.error(tCommon('read-aloud-error'));
      setStatus('idle');
    }
  }

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
      data-testid="speech-button-streaming"
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
