import { useToast } from '@/components/common/toast';
import { PcmStreamPlayer } from '@/utils/audio/pcm-stream-player';
import { readableStreamToAsyncIterable } from '@/utils/audio/readable-stream-to-async-iterable';
import { useTranslations } from 'next-intl';
import React from 'react';
import { GenerateSpeechStreamFn } from './types';

export type AudioPlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Drives a `PcmStreamPlayer` from React, exposing play/pause/resume controls and status.
 */
export function useAudioStream(generateSpeechStreamFn: GenerateSpeechStreamFn) {
  const toast = useToast();
  const tCommon = useTranslations('common');
  const [status, setStatus] = React.useState<AudioPlayerStatus>('idle');
  const [duration, setDuration] = React.useState<number | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [playbackRate, setPlaybackRateState] = React.useState(1);
  const playerRef = React.useRef<PcmStreamPlayer | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  // Web Audio has no time-update event, so the playback position is polled while playing.
  React.useEffect(() => {
    if (status !== 'playing') {
      return;
    }
    let frameId: number;
    const tick = () => {
      const player = playerRef.current;
      if (player) {
        setCurrentTime(player.getCurrentTime());
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [status]);

  const start = React.useCallback(
    async (text: string) => {
      if (status === 'loading') {
        return;
      }

      setStatus('loading');
      setDuration(null);
      setCurrentTime(0);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // The AudioContext must be created and unlocked synchronously within the user gesture
      // (click handler), before any `await`, otherwise browsers like Safari leave it suspended.
      const player = new PcmStreamPlayer({
        onStateChange: (next) => {
          if (next === 'ended' || next === 'error') {
            setStatus('idle');
            return;
          }
          setStatus(next);
        },
        onDurationKnown: setDuration,
      });
      player.unlockAudioContext();
      playerRef.current = player;

      try {
        const body = await generateSpeechStreamFn(text, { signal: abortController.signal });
        await player.start(readableStreamToAsyncIterable(body));
      } catch {
        if (abortController.signal.aborted) {
          return;
        }
        playerRef.current?.dispose();
        playerRef.current = null;
        toast.error(tCommon('read-aloud-error'));
        setStatus('idle');
      }
    },
    [generateSpeechStreamFn, status, toast, tCommon],
  );

  const pause = React.useCallback(() => {
    const player = playerRef.current;
    player?.pause();
    if (player) {
      setCurrentTime(player.getCurrentTime());
    }
  }, []);

  const resume = React.useCallback(() => {
    playerRef.current?.resume();
  }, []);

  const seek = React.useCallback((time: number) => {
    const player = playerRef.current;
    player?.seek(time);
    if (player) {
      setCurrentTime(player.getCurrentTime());
    }
  }, []);

  /**
   * Replays the stream from the start once it has already been fully buffered (after it ended),
   * reusing the decoded audio instead of re-requesting and re-generating it from the server.
   */
  const restart = React.useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.seek(0);
    setCurrentTime(player.getCurrentTime());
  }, []);

  /** Peak-amplitude bars for waveform rendering; only meaningful once `duration` is known. */
  const getWaveformPeaks = React.useCallback((barCount: number): number[] | null => {
    return playerRef.current?.getWaveformPeaks(barCount) ?? null;
  }, []);

  /** Only takes effect once the whole stream has been received; a no-op otherwise. */
  const setPlaybackRate = React.useCallback((rate: number) => {
    playerRef.current?.setPlaybackRate(rate);
    setPlaybackRateState(rate);
  }, []);

  return {
    status,
    start,
    pause,
    resume,
    seek,
    restart,
    duration,
    currentTime,
    getWaveformPeaks,
    playbackRate,
    setPlaybackRate,
  };
}
