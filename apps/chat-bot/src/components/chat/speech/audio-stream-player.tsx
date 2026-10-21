import { cn } from '@/utils/tailwind';
import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { Spinner } from '@ui/components/spinner';
import { useTranslations } from 'next-intl';
import React from 'react';
import { AudioWaveform } from './audio-waveform';
import { formatTime } from './format-time';
import { useAudioStream } from './use-audio-stream';

const SEEK_BACK_SECONDS = 5;

type AudioStreamPlayerProps = {
  text: string;
  generateSpeechStreamFn: (
    text: string,
    options: { signal: AbortSignal },
  ) => Promise<ReadableStream<Uint8Array>>;
  isSpeechModelEnabled: boolean;
  /**
   * Visually hides the player without unmounting it, so the buffered audio, playback position,
   * and underlying `AudioContext` survive toggling the player closed and back open. Active
   * playback is paused while hidden (resuming where it left off on reopen).
   */
  hidden?: boolean;
};

export default function AudioStreamPlayer({
  text,
  generateSpeechStreamFn,
  isSpeechModelEnabled,
  hidden = false,
}: AudioStreamPlayerProps) {
  const tCommon = useTranslations('common');

  const { status, duration, currentTime, start, pause, resume, seek, restart, getWaveformPeaks } =
    useAudioStream(generateSpeechStreamFn);
  const [dragValue, setDragValue] = React.useState<number | null>(null);

  const label = status === 'playing' ? tCommon('pause-message') : tCommon('read-aloud');
  const displayedTime = dragValue ?? currentTime;

  React.useEffect(() => {
    if (hidden && status === 'playing') {
      pause();
    }
  }, [hidden, status, pause]);

  if (!isSpeechModelEnabled) return null;

  async function handleButtonClick() {
    if (status === 'idle') {
      // `duration` stays set after the stream ends, so the audio is already fully buffered and
      // can be replayed directly instead of generating and re-fetching it again.
      if (duration !== null) {
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
    seek(Math.max(currentTime - SEEK_BACK_SECONDS, 0));
  }

  return (
    <div className={cn('flex flex-col gap-1 pt-4', hidden && 'hidden')}>
      <div className="flex flex-row gap-2 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={status === 'loading'}
          aria-label={label}
          title={label}
          onClick={() => handleButtonClick()}
        >
          {status === 'loading' && <Spinner />}
          {status === 'idle' && <PlayIcon weight="fill" />}
          {status === 'playing' && <PauseIcon />}
          {status === 'paused' && <PlayIcon weight="fill" />}
        </Button>
        <AudioWaveform
          duration={duration}
          isLoading={status === 'loading'}
          currentTime={displayedTime}
          getWaveformPeaks={getWaveformPeaks}
          onSeekPreview={setDragValue}
          onSeekCommit={(time) => {
            seek(time);
            setDragValue(null);
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={duration === null}
          aria-label={tCommon('seek-back-5-seconds')}
          title={tCommon('seek-back-5-seconds')}
          onClick={handleBack}
        >
          <ArrowCounterClockwiseIcon />
        </Button>
      </div>

      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(displayedTime)}
        {duration !== null && ` / ${formatTime(duration)}`}
      </span>
    </div>
  );
}
