import { takePrimedAudioElement } from './unlock-audio-playback';

const MP3_MIME_TYPE = 'audio/mpeg';
const MIN_BAR_HEIGHT = 0.08;

export type Mp3PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

type MediaSourceConstructor = typeof MediaSource;

/** iOS Safari exposes only `ManagedMediaSource`, which is API-compatible for this usage. */
function getMediaSourceConstructor(): MediaSourceConstructor | undefined {
  const managed = (globalThis as { ManagedMediaSource?: MediaSourceConstructor })
    .ManagedMediaSource;
  return managed ?? globalThis.MediaSource;
}

/** Appends a chunk and resolves once the source buffer has finished processing it. */
function appendChunk(
  sourceBuffer: SourceBuffer,
  chunk: Uint8Array<ArrayBufferLike>,
): Promise<void> {
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
    // Fetch response bytes are always backed by a real ArrayBuffer, never a SharedArrayBuffer, so
    // this narrowing cast (needed for BufferSource's stricter DOM types) is safe.
    sourceBuffer.appendBuffer(chunk as Uint8Array<ArrayBuffer>);
  });
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
  private disposed = false;
  private streamDone = false;
  private duration = 0;
  private playbackRate = 1;
  private mp3Chunks: Uint8Array<ArrayBufferLike>[] = [];
  private waveformSamples: Float32Array | null = null;

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
    const samples = this.waveformSamples;
    if (!samples || samples.length === 0 || barCount <= 0) {
      return new Array(Math.max(barCount, 0)).fill(0) as number[];
    }

    const peaks = new Array<number>(barCount).fill(0);
    const samplesPerBar = samples.length / barCount;
    for (let bar = 0; bar < barCount; bar++) {
      const start = Math.floor(bar * samplesPerBar);
      const end = Math.min(Math.round((bar + 1) * samplesPerBar), samples.length);
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

    audio.currentTime = Math.min(Math.max(time, 0), this.duration);
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

      for await (const chunk of chunks) {
        if (this.disposed) {
          return;
        }
        this.mp3Chunks.push(chunk);
        await appendChunk(sourceBuffer, chunk);
        if (this.state === 'loading') {
          if (this.pausedBeforePlaying) {
            audio.pause();
            this.setState('paused');
          } else {
            this.play(audio);
            this.setState('playing');
          }
        }
      }

      await this.finishStream();
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
    this.waveformSamples = null;
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
    audio.addEventListener('ended', () => {
      if (!this.disposed) {
        this.setState('ended');
      }
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

  private async finishStream(): Promise<void> {
    if (this.mp3Chunks.length === 0) {
      throw new Error('No audio data received from the speech stream');
    }

    const mediaSource = this.mediaSource;
    if (mediaSource?.readyState === 'open') {
      mediaSource.endOfStream();
    }

    // Decoded before announcing the duration, so seeking, speed changes and the waveform (all
    // gated on a known duration by the UI) become available together.
    const decodedDuration = await this.decodeWaveformSamples();
    if (this.disposed) {
      return;
    }

    const mediaSourceDuration = mediaSource?.duration ?? Number.NaN;
    this.duration =
      Number.isFinite(mediaSourceDuration) && mediaSourceDuration > 0
        ? mediaSourceDuration
        : (decodedDuration ?? 0);
    this.streamDone = true;
    this.callbacks.onDurationKnown?.(this.duration);
  }

  /**
   * Decodes the buffered MP3 once the stream is complete to obtain the samples the waveform is
   * drawn from, which the media element itself never exposes. Returns the decoded duration, or
   * `null` if decoding failed (the waveform then stays flat, playback is unaffected).
   */
  private async decodeWaveformSamples(): Promise<number | null> {
    try {
      const merged = concatChunks(this.mp3Chunks);
      // An offline context decodes without touching audio hardware or autoplay policies.
      const decoded = await new OfflineAudioContext(1, 1, 44_100).decodeAudioData(merged.buffer);
      this.waveformSamples = decoded.getChannelData(0);
      return decoded.duration;
    } catch {
      return null;
    }
  }

  private setState(state: Mp3PlayerState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}
