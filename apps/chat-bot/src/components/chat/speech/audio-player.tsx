import { cn } from '@/utils/tailwind';
import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ui/components/dropdown-menu';
import { Spinner } from '@ui/components/spinner';
import { useTranslations } from 'next-intl';
import React from 'react';
import { AudioWaveform } from './audio-waveform';
import { formatTime } from './format-time';
import { GenerateSpeechStreamFn } from './types';
import { useAudioStream } from './use-audio-stream';

const JUMP_BACK_SECONDS = 5;
const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

/** Formats a rate as e.g. `0.75x`, `1.0x`, `1.25x`, matching whole numbers getting one decimal. */
function formatPlaybackRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : rate}x`;
}

type AudioPlayerProps = {
  text: string;
  generateSpeechStreamFn: GenerateSpeechStreamFn;
  isSpeechModelEnabled: boolean;
  isInitialMessage: boolean;
  /**
   * True while `text` is still being streamed in (not yet the final message content). Manual
   * playback is disabled during this time, since starting it would synthesize only the current
   * partial text and `text` is never re-synthesized once playback has started.
   */
  isGenerating?: boolean;
  /**
   * Visually hides the player without unmounting it, so the buffered audio, playback position,
   * and underlying `AudioContext` survive toggling the player closed and back open. Active
   * playback is paused while hidden (resuming where it left off on reopen).
   */
  hidden?: boolean;
  /**
   * Incremented by the parent exactly once per automatic playback request (e.g. when a
   * speech-only message has just finished streaming). Starts playback as soon as it changes to a
   * value greater than `0`, unless the player is `hidden`. Using a counter (rather than a plain
   * boolean) lets the parent signal a one-off "play now" event without re-triggering on rerenders.
   */
  autoPlayTrigger?: number;
  className?: string;
};

export default function AudioPlayer({
  text,
  generateSpeechStreamFn,
  isSpeechModelEnabled,
  isInitialMessage,
  isGenerating = false,
  hidden = false,
  autoPlayTrigger = 0,
  className,
}: AudioPlayerProps) {
  const t = useTranslations('common');
  const {
    status,
    duration,
    currentTime,
    start,
    pause,
    resume,
    seek,
    restart,
    getWaveformPeaks,
    playbackRate,
    setPlaybackRate,
  } = useAudioStream(generateSpeechStreamFn, isInitialMessage);

  const [dragValue, setDragValue] = React.useState<number | null>(null);
  const displayedTime = dragValue ?? currentTime;
  const label = status === 'playing' ? t('pause-message') : t('read-aloud');
  const isStreamFullyLoaded = duration !== null;

  React.useEffect(() => {
    if (hidden && status === 'playing') {
      pause();
    }
  }, [hidden, status, pause]);

  const lastAutoPlayTriggerRef = React.useRef(autoPlayTrigger);
  React.useEffect(() => {
    const previousTrigger = lastAutoPlayTriggerRef.current;
    lastAutoPlayTriggerRef.current = autoPlayTrigger;
    if (autoPlayTrigger > previousTrigger && !hidden && status === 'idle') {
      void start(text);
    }
  }, [autoPlayTrigger, hidden, status, start, text]);

  if (!isSpeechModelEnabled) return null;

  async function handleButtonClick() {
    if (status === 'idle') {
      if (isGenerating) return;
      if (isStreamFullyLoaded) {
        restart();
      } else {
        await start(text);
      }
    } else if (status === 'playing') {
      pause();
    } else if (status === 'paused') {
      resume();
    }
  }

  function handleBack() {
    seek(Math.max(currentTime - JUMP_BACK_SECONDS, 0));
  }

  return (
    <div className={cn('flex flex-col gap-1 pt-4', hidden && 'hidden', className)}>
      <div className="flex flex-row gap-2 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={status === 'loading' || (status === 'idle' && isGenerating)}
          aria-label={label}
          title={label}
          onClick={() => handleButtonClick()}
        >
          {status === 'loading' && <Spinner />}
          {status === 'idle' && <PlayIcon weight="fill" />}
          {status === 'playing' && <PauseIcon weight="fill" />}
          {status === 'paused' && <PlayIcon weight="fill" />}
        </Button>
        <AudioWaveform
          duration={duration}
          currentTime={displayedTime}
          getWaveformPeaks={getWaveformPeaks}
          isLoading={status === 'loading' || (status === 'playing' && !isStreamFullyLoaded)}
          onSeekPreview={setDragValue}
          onSeekCommit={(time) => {
            seek(time);
            setDragValue(null);
          }}
          onSeekCancel={() => setDragValue(null)}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={!isStreamFullyLoaded}
          aria-label={t('jump-back-5-seconds')}
          title={t('jump-back-5-seconds')}
          onClick={handleBack}
        >
          <ArrowCounterClockwiseIcon />
          {t('5-seconds-label')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="xs"
              disabled={!isStreamFullyLoaded}
              aria-label={t('playback-speed')}
              title={t('playback-speed')}
            >
              {formatPlaybackRate(playbackRate)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={String(playbackRate)}
              onValueChange={(value) => setPlaybackRate(Number(value))}
            >
              {PLAYBACK_RATES.map((rate) => (
                <DropdownMenuRadioItem key={rate} value={String(rate)}>
                  {formatPlaybackRate(rate)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="text-sm text-muted-foreground tabular-nums">
        {formatTime(displayedTime)}
        {isStreamFullyLoaded && ` / ${formatTime(duration)}`}
      </span>
    </div>
  );
}
