import { logError } from '@shared/logging';
import { useTranslations } from 'next-intl';
import React from 'react';

import { useToast } from '@/components/common/toast';
import { Mp3StreamPlayer } from '@/utils/audio/mp3-stream-player';
import { readableStreamToAsyncIterable } from '@/utils/audio/readable-stream-to-async-iterable';

import { useAudioPlaybackCoordinator } from './audio-playback-coordinator';
import { GenerateSpeechStreamFn } from './types';

export type AudioPlayerStatus = 'idle' | 'loading' | 'playing' | 'paused';

/**
 * Drives an `Mp3StreamPlayer` from React, exposing play/pause/resume controls and status.
 * Starting or resuming playback pauses all other `AudioPlayer` instances registered with the
 * nearest `AudioPlaybackCoordinatorProvider`, keeping their state and position intact.
 */
export function useAudioStream(
  generateSpeechStreamFn: GenerateSpeechStreamFn,
  isInitialMessage: boolean,
) {
  const toast = useToast();
  const tCommon = useTranslations('common');
  const { register, notifyPlaying } = useAudioPlaybackCoordinator();
  const id = React.useId();
  const [status, setStatus] = React.useState<AudioPlayerStatus>('idle');
  const [duration, setDuration] = React.useState<number | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [playbackRate, setPlaybackRateState] = React.useState(1);
  const playerRef = React.useRef<Mp3StreamPlayer | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  // `timeupdate` only fires a few times per second, so the position is polled while playing.
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
      abortControllerRef.current?.abort();
      playerRef.current?.dispose();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // The audio element must be created and unlocked synchronously within the user gesture
      // (click handler), before any `await`, otherwise browsers like Safari block playback.
      const player: Mp3StreamPlayer = new Mp3StreamPlayer({
        onStateChange: (next) => {
          // A superseded player must not drive the UI of the one that replaced it.
          if (playerRef.current !== player) {
            return;
          }
          if (next === 'ended' || next === 'error') {
            setStatus('idle');
            return;
          }
          // Covers every path that can make this player audible (initial start, resume, restart,
          // seeking/rate-changing an ended player), not just the explicit start()/resume() calls -
          // seeking a still-paused player never reaches 'playing', so it won't pause others.
          if (next === 'playing') {
            notifyPlaying(id);
          }
          setStatus(next);
        },
        onDurationKnown: (next) => {
          if (playerRef.current === player) {
            setDuration(next);
          }
        },
      });
      playerRef.current = player;

      try {
        player.unlockPlayback();
        const body = await generateSpeechStreamFn(text, isInitialMessage, {
          signal: abortController.signal,
        });
        await player.start(readableStreamToAsyncIterable(body));
      } catch (error) {
        if (abortController.signal.aborted || playerRef.current !== player) {
          return;
        }
        logError('Speech playback failed', error);
        player.dispose();
        playerRef.current = null;
        toast.error(tCommon('read-aloud-error'));
        setStatus('idle');
      }
    },
    [generateSpeechStreamFn, status, toast, tCommon, notifyPlaying, id, isInitialMessage],
  );

  const pause = React.useCallback(() => {
    const player = playerRef.current;
    player?.pause();
    if (player) {
      setCurrentTime(player.getCurrentTime());
    }
  }, []);

  React.useEffect(() => register(id, pause), [register, id, pause]);

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
