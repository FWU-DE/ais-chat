import { getMp3Duration, parseMp3Frames } from './mp3-frames';
import { computeWaveformPeaks } from './mp3-waveform';
import { takePrimedAudioElement } from './unlock-audio-playback';

const MP3_MIME_TYPE = 'audio/mpeg';
const MIN_BAR_HEIGHT = 0.08;
// SourceBuffers have a small quota (about 12 MB of audio in Chrome, roughly 15 min of speech), so
// only a window around the playback position is kept in the buffer.
const MAX_BUFFER_AHEAD_SECONDS = 60;
const KEEP_BUFFER_BEHIND_SECONDS = 10;
const MIN_EVICTION_SECONDS = 1;
const FULLY_BUFFERED_TOLERANCE_SECONDS = 0.5;

export type Mp3PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

type MediaSourceConstructor = typeof MediaSource;

/** iOS Safari exposes only `ManagedMediaSource`, which is API-compatible for this usage. */
function getMediaSourceConstructor(): MediaSourceConstructor | undefined {
  const managed = (globalThis as { ManagedMediaSource?: MediaSourceConstructor })
    .ManagedMediaSource;
  return managed ?? globalThis.MediaSource;
}

/** Runs an append/remove operation and resolves once the source buffer has finished processing it. */
function updateSourceBuffer(sourceBuffer: SourceBuffer, operation: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd);
      sourceBuffer.removeEventListener('error', onError);
    };
    const onUpdateEnd = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Failed to buffer speech audio data'));
    };

    sourceBuffer.addEventListener('updateend', onUpdateEnd);
    sourceBuffer.addEventListener('error', onError);
    try {
      operation();
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof Error && error.name === 'QuotaExceededError';
}

/** Removes buffered audio before `end` (in seconds) to free up the source buffer's quota. */
async function evictBufferedBefore(sourceBuffer: SourceBuffer, end: number): Promise<void> {
  const { buffered } = sourceBuffer;
  if (buffered.length === 0 || end - buffered.start(0) < MIN_EVICTION_SECONDS) {
    return;
  }
  await updateSourceBuffer(sourceBuffer, () => sourceBuffer.remove(0, end));
}

function getBufferedAhead(sourceBuffer: SourceBuffer, currentTime: number): number {
  const { buffered } = sourceBuffer;
  return buffered.length === 0 ? 0 : buffered.end(buffered.length - 1) - currentTime;
}

function concatChunks(chunks: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBuffer> {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Plays a stream of MP3 chunks as they arrive by appending them to a `MediaSource` backing a
 * hidden `<audio>` element. MP3 frames share a bit reservoir and carry encoder delay/padding, so
 * decoding chunks individually (e.g. via `decodeAudioData` into Web Audio) would produce audible
 * gaps — the media element's own demuxer is what keeps playback continuous. Using an element also
 * gives native seeking and pitch-corrected `playbackRate` for free.
 *
 * The network stream is always read completely into memory, but only a window around the playback
 * position is appended to the source buffer. Once the stream is complete, seeking outside that
 * window switches the element to a Blob URL holding the whole audio.
 */
export class Mp3StreamPlayer {
  private audio: HTMLAudioElement | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private state: Mp3PlayerState = 'idle';
  // Latches a `pause()` call that arrived while still 'idle'/'loading' (e.g. another player was
  // started first), so the request keeps buffering in the background but never starts audible
  // playback once its first chunk is appended; cleared once consumed or on `resume()`.
  private pausedBeforePlaying = false;
  // Latches an 'ended' media event that fired before finalization published the duration, so the
  // state is only reported once replaying the buffered audio is actually possible.
  private endedBeforeStreamDone = false;
  private disposed = false;
  private streamDone = false;
  private networkDone = false;
  // Set once the element plays a Blob URL of the whole audio instead of the MediaSource.
  private usingFullSource = false;
  // Latest seek target requested before the full source's metadata loaded.
  private pendingSeekTime: number | null = null;
  private duration = 0;
  private playbackRate = 1;
  private mp3Chunks: Uint8Array<ArrayBufferLike>[] = [];
  // Received chunks not yet appended to the source buffer.
  private pendingChunks: Uint8Array<ArrayBufferLike>[] = [];
  private wakeFeeder: (() => void) | null = null;
  private waveformPeaks: Float32Array | null = null;

  constructor(
    private readonly callbacks: {
      onStateChange?: (state: Mp3PlayerState) => void;
      onDurationKnown?: (duration: number) => void;
    } = {},
  ) {}

  getState(): Mp3PlayerState {
    return this.state;
  }

  /** Total audio length in seconds, known only once the whole stream has been received. */
  getDuration(): number {
    return this.duration;
  }

  /** Current playback position in seconds, clamped to `[0, duration]` once the length is known. */
  getCurrentTime(): number {
    if (this.state === 'ended') {
      return this.duration;
    }
    const currentTime = this.audio?.currentTime ?? 0;
    const clamped = Math.max(currentTime, 0);
    return this.duration > 0 ? Math.min(clamped, this.duration) : clamped;
  }

  /** Current playback speed multiplier (only changeable once the whole stream has loaded). */
  getPlaybackRate(): number {
    return this.playbackRate;
  }

  /**
   * Downsamples the decoded audio into `barCount` peak-amplitude values (normalized to
   * `[0.08, 1]`, so even silent sections render as a small visible bar) for rendering a waveform.
   * Only meaningful once the whole stream has been received and decoded (mirrors `seek()`'s
   * availability); returns an all-zero array otherwise so callers can render a placeholder.
   */
  getWaveformPeaks(barCount: number): number[] {
    const samples = this.waveformPeaks;
    if (!samples || samples.length === 0 || barCount <= 0) {
      return new Array(Math.max(barCount, 0)).fill(0) as number[];
    }

    const peaks = new Array<number>(barCount).fill(0);
    const samplesPerBar = samples.length / barCount;
    for (let bar = 0; bar < barCount; bar++) {
      const start = Math.min(Math.floor(bar * samplesPerBar), samples.length - 1);
      const end = Math.max(
        Math.min(Math.round((bar + 1) * samplesPerBar), samples.length),
        start + 1,
      );
      let peak = 0;
      for (let index = start; index < end; index++) {
        const value = Math.abs(samples[index] ?? 0);
        if (value > peak) peak = value;
      }
      peaks[bar] = peak;
    }

    const maxPeak = Math.max(...peaks, Number.EPSILON);
    return peaks.map((peak) => MIN_BAR_HEIGHT + (peak / maxPeak) * (1 - MIN_BAR_HEIGHT));
  }

  /**
   * Jumps playback to `time` seconds into the stream. Only available once the whole stream has
   * been received (so the full audio is buffered locally); a no-op otherwise.
   */
  seek(time: number): void {
    const audio = this.audio;
    if (!this.streamDone || this.disposed || !audio) {
      return;
    }

    const target = Math.min(Math.max(time, 0), this.duration);
    if (!this.isFullyBuffered()) {
      this.switchToFullSource(audio);
    }
    if (this.usingFullSource && audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      this.pendingSeekTime = target;
    }
    audio.currentTime = target;
    if (this.state === 'paused') {
      return;
    }
    this.play(audio);
    this.setState('playing');
  }

  /**
   * Changes the playback speed. Only available once the whole stream has been received; a no-op
   * otherwise.
   */
  setPlaybackRate(rate: number): void {
    if (!this.streamDone || this.disposed) {
      return;
    }
    this.playbackRate = rate;
    if (this.audio) {
      // The default rate survives a source switch, which resets `playbackRate`.
      this.audio.defaultPlaybackRate = rate;
      this.audio.playbackRate = rate;
    }
  }

  /**
   * Creates the `<audio>` element and starts it. Browsers such as Safari only clear an element's
   * autoplay restriction when `play()` is called synchronously within a user-gesture handler, so
   * callers must invoke this directly inside their click handler, before awaiting anything, then
   * pass the stream to `start()` once it's available.
   */
  unlockPlayback(): void {
    this.play(this.ensureAudioElement());
  }

  /** Starts consuming the chunk stream, buffering audio for playback as it arrives. */
  async start(chunks: AsyncIterable<Uint8Array<ArrayBufferLike>>): Promise<void> {
    this.setState('loading');

    try {
      const audio = this.ensureAudioElement();
      const sourceBuffer = await this.openSourceBuffer();
      await Promise.all([this.receiveChunks(chunks), this.feedSourceBuffer(sourceBuffer, audio)]);
    } catch (error) {
      if (!this.disposed) {
        this.setState('error');
      }
      throw error;
    }
  }

  /** Pauses playback; incoming chunks (if the stream is still open) keep being buffered in the
   * background so resuming is instant. If called while still 'idle'/'loading' (a request
   * superseded before its first chunk arrived), the intent is latched so playback never becomes
   * audible once buffering starts, rather than being silently ignored. */
  pause(): void {
    if (this.state === 'idle' || this.state === 'loading') {
      this.pausedBeforePlaying = true;
      this.audio?.pause();
      return;
    }
    if (this.state !== 'playing') {
      return;
    }
    this.audio?.pause();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') {
      return;
    }
    this.pausedBeforePlaying = false;
    if (this.audio) {
      this.play(this.audio);
    }
    this.setState('playing');
  }

  dispose(): void {
    this.disposed = true;
    this.pendingSeekTime = null;
    this.notifyFeeder();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.audio = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.mp3Chunks = [];
    this.pendingChunks = [];
    this.waveformPeaks = null;
  }

  private play(audio: HTMLAudioElement): void {
    void audio.play().catch(() => {
      // Rejects when the browser blocks autoplay (or when playback is interrupted by a pause or
      // dispose), in which case the UI should offer to start playback from a user gesture.
      if (!this.disposed && this.state === 'playing') {
        this.setState('paused');
      }
    });
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (this.audio) {
      return this.audio;
    }

    const MediaSourceConstructor = getMediaSourceConstructor();
    if (!MediaSourceConstructor?.isTypeSupported(MP3_MIME_TYPE)) {
      throw new Error('Streaming MP3 playback is not supported in this browser');
    }

    const mediaSource = new MediaSourceConstructor();
    const objectUrl = URL.createObjectURL(mediaSource);
    // Reuses the element that was unlocked during the last user gesture, if there is one, so
    // replies that start playing on their own are not blocked by autoplay policies.
    const audio = takePrimedAudioElement() ?? new Audio();
    // Required by `ManagedMediaSource`, ignored by plain `MediaSource`.
    audio.disableRemotePlayback = true;
    audio.preservesPitch = true;
    audio.src = objectUrl;
    // Playback progress frees room in the buffer window, so the feeder re-checks on every update.
    audio.addEventListener('timeupdate', () => this.notifyFeeder());
    audio.addEventListener('ended', () => {
      if (this.disposed) {
        return;
      }
      if (!this.streamDone) {
        this.endedBeforeStreamDone = true;
        return;
      }
      this.setState('ended');
    });

    this.mediaSource = mediaSource;
    this.objectUrl = objectUrl;
    this.audio = audio;
    return audio;
  }

  private openSourceBuffer(): Promise<SourceBuffer> {
    const mediaSource = this.mediaSource;
    if (!mediaSource) {
      throw new Error('Audio element has not been initialized');
    }
    if (this.sourceBuffer) {
      return Promise.resolve(this.sourceBuffer);
    }

    const addSourceBuffer = () => {
      const sourceBuffer = mediaSource.addSourceBuffer(MP3_MIME_TYPE);
      this.sourceBuffer = sourceBuffer;
      return sourceBuffer;
    };

    if (mediaSource.readyState === 'open') {
      return Promise.resolve(addSourceBuffer());
    }

    return new Promise((resolve, reject) => {
      mediaSource.addEventListener(
        'sourceopen',
        () => {
          try {
            resolve(addSourceBuffer());
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        },
        { once: true },
      );
    });
  }

  /** Reads the whole network stream into memory without waiting for playback to catch up. */
  private async receiveChunks(chunks: AsyncIterable<Uint8Array<ArrayBufferLike>>): Promise<void> {
    for await (const chunk of chunks) {
      if (this.disposed) {
        return;
      }
      this.mp3Chunks.push(chunk);
      this.pendingChunks.push(chunk);
      this.notifyFeeder();
    }
    this.networkDone = true;
    this.notifyFeeder();
    await this.finishStream();
  }

  /**
   * Appends received chunks while at most `MAX_BUFFER_AHEAD_SECONDS` are buffered ahead of the
   * playback position, evicting already played audio to stay within the source buffer's quota.
   */
  private async feedSourceBuffer(
    sourceBuffer: SourceBuffer,
    audio: HTMLAudioElement,
  ): Promise<void> {
    try {
      for (;;) {
        if (this.disposed || this.usingFullSource) {
          return;
        }
        const chunk = this.pendingChunks[0];
        if (!chunk) {
          if (this.networkDone) {
            break;
          }
          await this.waitForFeederWake();
          continue;
        }
        if (getBufferedAhead(sourceBuffer, audio.currentTime) >= MAX_BUFFER_AHEAD_SECONDS) {
          await this.waitForFeederWake();
          continue;
        }

        await evictBufferedBefore(sourceBuffer, audio.currentTime - KEEP_BUFFER_BEHIND_SECONDS);
        try {
          // Fetch response bytes are always backed by a real ArrayBuffer, never a
          // SharedArrayBuffer, so this narrowing cast (needed for BufferSource's stricter DOM
          // types) is safe.
          await updateSourceBuffer(sourceBuffer, () =>
            sourceBuffer.appendBuffer(chunk as Uint8Array<ArrayBuffer>),
          );
        } catch (error) {
          if (!isQuotaExceededError(error)) {
            throw error;
          }
          await evictBufferedBefore(sourceBuffer, audio.currentTime);
          await this.waitForFeederWake();
          continue;
        }
        this.pendingChunks.shift();

        if (this.state === 'loading' && !this.disposed) {
          if (this.pausedBeforePlaying) {
            audio.pause();
            this.setState('paused');
          } else {
            this.play(audio);
            this.setState('playing');
          }
        }
      }

      if (this.mediaSource?.readyState === 'open') {
        this.mediaSource.endOfStream();
      }
    } catch (error) {
      // Disposing or switching to the full source detaches the MediaSource mid-operation.
      if (this.disposed || this.usingFullSource) {
        return;
      }
      throw error;
    }
  }

  private waitForFeederWake(): Promise<void> {
    return new Promise((resolve) => {
      this.wakeFeeder = resolve;
    });
  }

  private notifyFeeder(): void {
    const wake = this.wakeFeeder;
    this.wakeFeeder = null;
    wake?.();
  }

  private isFullyBuffered(): boolean {
    if (this.usingFullSource) {
      return true;
    }
    const buffered = this.sourceBuffer?.buffered;
    return (
      this.pendingChunks.length === 0 &&
      buffered?.length === 1 &&
      buffered.start(0) <= FULLY_BUFFERED_TOLERANCE_SECONDS &&
      buffered.end(0) >= this.duration - FULLY_BUFFERED_TOLERANCE_SECONDS
    );
  }

  /** Replaces the MediaSource with a Blob URL of the whole audio, so every position is seekable. */
  private switchToFullSource(audio: HTMLAudioElement): void {
    this.usingFullSource = true;
    this.pendingChunks = [];
    this.notifyFeeder();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    // Same narrowing as for `appendBuffer`: fetch response bytes are never SharedArrayBuffers.
    const blob = new Blob(this.mp3Chunks as Uint8Array<ArrayBuffer>[], { type: MP3_MIME_TYPE });
    this.objectUrl = URL.createObjectURL(blob);
    this.pendingSeekTime = null;
    // Some browsers ignore seeks before the new source's metadata has loaded.
    audio.addEventListener(
      'loadedmetadata',
      () => {
        if (this.disposed || this.pendingSeekTime === null) {
          return;
        }
        audio.currentTime = this.pendingSeekTime;
        this.pendingSeekTime = null;
      },
      { once: true },
    );
    audio.src = this.objectUrl;
  }

  private async finishStream(): Promise<void> {
    if (this.mp3Chunks.length === 0) {
      throw new Error('No audio data received from the speech stream');
    }

    const bytes = concatChunks(this.mp3Chunks);
    const frames = parseMp3Frames(bytes);
    // Computed before announcing the duration, so seeking, speed changes and the waveform (all
    // gated on a known duration by the UI) become available together.
    this.waveformPeaks = await computeWaveformPeaks(bytes, frames);
    if (this.disposed) {
      return;
    }

    this.duration = getMp3Duration(frames);
    this.streamDone = true;
    this.callbacks.onDurationKnown?.(this.duration);

    if (this.endedBeforeStreamDone) {
      this.endedBeforeStreamDone = false;
      this.setState('ended');
    }
  }

  private setState(state: Mp3PlayerState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}
