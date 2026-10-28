import { cn } from '@/utils/tailwind';
import { useTranslations } from 'next-intl';
import React from 'react';
import { formatTime } from './format-time';

type AudioWaveformProps = {
  /** `null` while idle or the stream is still loading (duration not yet known); renders a placeholder. */
  duration: number | null;
  /** Position to render the progress fill at; the caller decides between live playback position
   *  and a drag-preview value, mirroring the `Slider`'s controlled `value` prop. */
  currentTime: number;
  getWaveformPeaks: (barCount: number) => number[] | null;
  /** Fired continuously while clicking/dragging, for live preview (no actual seek yet). */
  onSeekPreview: (time: number) => void;
  /** Fired once the pointer is released (or on a keyboard step), committing the seek. */
  onSeekCommit: (time: number) => void;
  /** Fired when a drag gesture is interrupted (e.g. `pointercancel` or an unexpected loss of
   *  pointer capture) without ever reaching `pointerup`. The caller should clear any preview
   *  value it derived from `onSeekPreview` without seeking. */
  onSeekCancel: () => void;
  className?: string;
};

const BAR_WIDTH_PX = 3;
const BAR_GAP_PX = 2;
const MIN_BAR_COUNT = 16;
const MAX_BAR_COUNT = 150;
const DEFAULT_BAR_COUNT = 60;
const SEEK_STEP_SECONDS = 2;
const PLACEHOLDER_BAR_HEIGHT = 0.25;

function barCountForWidth(width: number): number {
  if (width <= 0) return MIN_BAR_COUNT;
  const count = Math.floor(width / (BAR_WIDTH_PX + BAR_GAP_PX));
  return Math.min(Math.max(count, MIN_BAR_COUNT), MAX_BAR_COUNT);
}

function Bars({ peaks, className }: { peaks: number[]; className?: string }) {
  return (
    <div className={cn('flex h-full w-full items-center gap-0.5', className)}>
      {peaks.map((peak, index) => (
        <div
          key={index}
          className="min-w-0.75 flex-1 rounded-full bg-current"
          style={{ height: `${Math.round(peak * 100)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Renders the audio stream position as a waveform instead of a plain slider: a flat pulsing
 * placeholder while the stream is still loading, and once fully loaded, the real peak-amplitude
 * waveform with the already-played portion overlaid in a solid color. Supports click/drag/touch
 * seeking once loaded (seeking requires the whole stream to be buffered, see `PcmStreamPlayer`).
 */
export function AudioWaveform({
  duration,
  currentTime,
  getWaveformPeaks,
  onSeekPreview,
  onSeekCommit,
  onSeekCancel,
  className,
}: AudioWaveformProps) {
  const t = useTranslations('common');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [barCount, setBarCount] = React.useState(DEFAULT_BAR_COUNT);
  // Not rendered, so a ref (rather than state) keeps the value synchronously accurate for the
  // `lostpointercapture` check below, which can fire within the same tick as `pointerup`/`pointercancel`.
  const isDraggingRef = React.useRef(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBarCount(barCountForWidth(entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const peaks = React.useMemo(
    () => (duration !== null ? getWaveformPeaks(barCount) : null),
    [duration, barCount, getWaveformPeaks],
  );

  const isInteractive = peaks !== null;
  const progress = duration !== null && duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  function timeFromPointerEvent(event: { clientX: number }): number {
    const container = containerRef.current;
    if (!container || duration === null) return 0;
    const rect = container.getBoundingClientRect();
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    return Math.min(Math.max(ratio, 0), 1) * duration;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isInteractive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    isDraggingRef.current = true;
    onSeekPreview(timeFromPointerEvent(event));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isInteractive || !isDraggingRef.current) return;
    onSeekPreview(timeFromPointerEvent(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!isInteractive) return;
    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onSeekCommit(timeFromPointerEvent(event));
  }

  /** Handles `pointercancel` (e.g. an interrupted touch gesture) and `lostpointercapture` (any
   *  other unexpected loss of capture). Both can fire without a preceding `pointerup`, so without
   *  this the drag would appear stuck: `isDraggingRef` would stay `true`, pointer moves elsewhere
   *  on the page would keep updating the parent's preview, and the preview value would never be
   *  cleared (the component falls back to `currentTime` only via that callback). Ignored if we're
   *  not currently dragging, since `handlePointerUp` already clears `isDraggingRef` before
   *  releasing capture, and both events can follow a normal `pointerup`. */
  function handlePointerInterrupt() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    onSeekCancel();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isInteractive || duration === null) return;
    if (event.key === 'ArrowLeft') {
      onSeekCommit(Math.max(currentTime - SEEK_STEP_SECONDS, 0));
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      onSeekCommit(Math.min(currentTime + SEEK_STEP_SECONDS, duration));
      event.preventDefault();
    } else if (event.key === 'Home') {
      onSeekCommit(0);
      event.preventDefault();
    } else if (event.key === 'End') {
      onSeekCommit(duration);
      event.preventDefault();
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-6 w-full',
        isInteractive ? 'cursor-pointer touch-none' : '',
        className,
      )}
      role="slider"
      aria-label={t('audio-playback-position')}
      aria-valuemin={0}
      aria-valuemax={duration ?? 0}
      aria-valuenow={isInteractive ? currentTime : undefined}
      aria-valuetext={
        isInteractive && duration !== null
          ? `${formatTime(currentTime)} / ${formatTime(duration)}`
          : undefined
      }
      aria-disabled={!isInteractive}
      tabIndex={isInteractive ? 0 : -1}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerInterrupt}
      onLostPointerCapture={handlePointerInterrupt}
      onKeyDown={handleKeyDown}
    >
      {peaks === null ? (
        <Bars
          peaks={new Array(barCount).fill(PLACEHOLDER_BAR_HEIGHT) as number[]}
          className={cn(
            'text-muted-foreground/50',
            !isInteractive && 'animate-pulse [animation-duration:1.2s]',
          )}
        />
      ) : (
        <>
          <Bars peaks={peaks} className="text-muted-foreground/20" />
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
          >
            <Bars peaks={peaks} className="text-primary" />
          </div>
        </>
      )}
    </div>
  );
}
