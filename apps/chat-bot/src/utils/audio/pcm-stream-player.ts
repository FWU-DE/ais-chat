/**
 * Decodes a chunk of raw 16-bit signed little-endian PCM bytes into normalized Float32 samples
 * (the format Web Audio's `AudioBuffer` expects), carrying over any trailing odd byte to the next
 * call so sample alignment is preserved across chunk boundaries (network chunks can split a
 * 2-byte sample in half).
 */
export function decodePcm16ToFloat32(
  bytes: Uint8Array<ArrayBufferLike>,
  leftover: Uint8Array<ArrayBufferLike>,
): { samples: Float32Array<ArrayBuffer>; leftover: Uint8Array<ArrayBufferLike> } {
  const combined =
    leftover.length === 0
      ? bytes
      : (() => {
          const merged = new Uint8Array(leftover.length + bytes.length);
          merged.set(leftover, 0);
          merged.set(bytes, leftover.length);
          return merged;
        })();

  const usableByteLength = Math.floor(combined.length / 2) * 2;
  const sampleCount = usableByteLength / 2;
  const samples = new Float32Array(sampleCount);
  // Fetch response bytes are always backed by a real ArrayBuffer, never a SharedArrayBuffer, so
  // this narrowing cast (needed for DataView/copyToChannel's stricter DOM types) is safe.
  const view = new DataView(combined.buffer as ArrayBuffer, combined.byteOffset, usableByteLength);

  for (let i = 0; i < sampleCount; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }

  return { samples, leftover: combined.subarray(usableByteLength) };
}

/**
 * Wraps raw Float32 PCM samples in a WAV header so they can be played back through an
 * `HTMLAudioElement`. Unlike `AudioBufferSourceNode.playbackRate` (a Web Audio node, which simply
 * resamples and therefore pitch-shifts), `HTMLMediaElement.playbackRate` combined with
 * `preservesPitch` applies browser-native pitch correction when playing faster/slower.
 */
function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample * CHANNELS;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.min(Math.max(samples[i] ?? 0, -1), 1);
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export type PcmPlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

const SAMPLE_RATE = 24_000;
const CHANNELS = 1;

/**
 * Plays a stream of raw 16-bit PCM (24 kHz, mono) chunks as they arrive, using the Web Audio API
 * instead of `<audio>`/MediaSource Extensions (MSE doesn't support headerless raw PCM as a
 * demuxable source). Chunks are scheduled back-to-back against the AudioContext clock for gapless
 * playback, and every decoded chunk is kept (not discarded after playing) so pause/resume works
 * via `AudioContext.suspend()/resume()` without re-fetching anything. Once the whole stream has
 * been received, seeking or changing the playback speed hands playback off to a hidden `<audio>`
 * element (see `playFromFullStream()`) built from the buffered samples.
 */
export class PcmStreamPlayer {
  private audioContext: AudioContext | null = null;
  private scheduledUntil = 0;
  private leftoverBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private activeSources: AudioBufferSourceNode[] = [];
  private pendingSourceCount = 0;
  private streamDone = false;
  private state: PcmPlayerState = 'idle';
  // Latches a `pause()` call that arrived while still 'idle'/'loading' (e.g. another player was
  // started first), so the request keeps buffering in the background but never starts audible
  // playback once its first chunk is scheduled; cleared once consumed or on `resume()`.
  private pausedBeforePlaying = false;
  private disposed = false;
  private duration = 0;
  private sampleChunks: Float32Array<ArrayBuffer>[] = [];
  // Reference point the current playback position is derived from: `playbackStartOffset` is the
  // buffer time (seconds into the full stream) that corresponded to the AudioContext clock reading
  // `playbackStartContextTime`. Since the clock doesn't advance while suspended, this also keeps
  // the position correct across pause/resume for free.
  private playbackStartContextTime = 0;
  private playbackStartOffset = 0;
  private playbackRate = 1;
  // Once a seek or a speed change happens (only possible after the whole stream is received),
  // playback hands off from the chunk-scheduled AudioContext nodes to this element, which applies
  // real pitch-corrected time-stretching for `playbackRate` (the Web Audio nodes used above don't).
  private audioElement: HTMLAudioElement | null = null;
  private audioElementUrl: string | null = null;

  constructor(
    private readonly callbacks: {
      onStateChange?: (state: PcmPlayerState) => void;
      onDurationKnown?: (duration: number) => void;
    } = {},
  ) {}

  getState(): PcmPlayerState {
    return this.state;
  }

  /** Total audio length in seconds, final only once the whole stream has been received. */
  getDuration(): number {
    return this.duration;
  }

  /** Current playback position in seconds, clamped to `[0, duration]`. */
  getCurrentTime(): number {
    if (this.state === 'ended') {
      return this.duration;
    }
    if (this.audioElement) {
      return Math.min(Math.max(this.audioElement.currentTime, 0), this.duration);
    }
    const audioContext = this.audioContext;
    if (!audioContext || this.state === 'idle' || this.state === 'loading') {
      return 0;
    }
    const elapsed =
      this.playbackStartOffset + (audioContext.currentTime - this.playbackStartContextTime);
    return Math.min(Math.max(elapsed, 0), this.duration);
  }

  /** Current playback speed multiplier (only changeable once the whole stream has loaded). */
  getPlaybackRate(): number {
    return this.playbackRate;
  }

  /**
   * Downsamples the decoded PCM into `barCount` peak-amplitude values (normalized to `[0.08, 1]`,
   * so even silent sections render as a small visible bar) for rendering a waveform. Only
   * meaningful once the whole stream has been received (mirrors `seek()`'s availability); returns
   * an all-zero array otherwise so callers can render a flat/placeholder waveform.
   */
  getWaveformPeaks(barCount: number): number[] {
    if (!this.streamDone || barCount <= 0) {
      return new Array(Math.max(barCount, 0)).fill(0) as number[];
    }

    const totalSamples = this.sampleChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const peaks = new Array<number>(barCount).fill(0);
    if (totalSamples === 0) {
      return peaks;
    }

    const samplesPerBar = totalSamples / barCount;
    let chunkIndex = 0;
    let indexInChunk = 0;
    let globalIndex = 0;
    for (let bar = 0; bar < barCount; bar++) {
      const bucketEnd = Math.round((bar + 1) * samplesPerBar);
      let peak = 0;
      while (globalIndex < bucketEnd && chunkIndex < this.sampleChunks.length) {
        const chunk = this.sampleChunks[chunkIndex];
        const value = Math.abs(chunk?.[indexInChunk] ?? 0);
        if (value > peak) peak = value;
        globalIndex++;
        indexInChunk++;
        if (chunk && indexInChunk >= chunk.length) {
          chunkIndex++;
          indexInChunk = 0;
        }
      }
      peaks[bar] = peak;
    }

    const maxPeak = Math.max(...peaks, Number.EPSILON);
    const MIN_BAR_HEIGHT = 0.08;
    return peaks.map((peak) => MIN_BAR_HEIGHT + (peak / maxPeak) * (1 - MIN_BAR_HEIGHT));
  }

  /**
   * Jumps playback to `time` seconds into the stream. Only available once the whole stream has
   * been received (so the full audio is already decoded locally); a no-op otherwise.
   */
  seek(time: number): void {
    this.playFromFullStream(time);
  }

  /**
   * Changes the playback speed. Only available once the whole stream has been received; a no-op
   * otherwise. If already handed off to the audio element, the rate is updated in place (no
   * restart); otherwise this performs the initial hand-off at the current position.
   */
  setPlaybackRate(rate: number): void {
    if (!this.streamDone || this.disposed) {
      return;
    }
    this.playbackRate = rate;
    if (this.audioElement) {
      this.audioElement.playbackRate = rate;
      return;
    }
    this.playFromFullStream(this.getCurrentTime());
  }

  /**
   * Hands playback off from the chunk-scheduled AudioContext nodes to a hidden `<audio>` element
   * playing the full, already-buffered stream, starting at `time`. Backs both `seek()` and the
   * initial `setPlaybackRate()` call; only available once the whole stream has been received (so
   * the full audio is already decoded locally).
   */
  private playFromFullStream(time: number): void {
    if (!this.streamDone || this.disposed) {
      return;
    }

    for (const source of this.activeSources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.activeSources = [];
    this.pendingSourceCount = 0;

    const audio = this.ensureAudioElement();
    const clamped = Math.min(Math.max(time, 0), this.duration);
    audio.playbackRate = this.playbackRate;
    audio.currentTime = clamped;

    if (this.state === 'paused') {
      this.setState('paused');
      return;
    }
    void audio.play();
    this.setState('playing');
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (this.audioElement) {
      return this.audioElement;
    }
    const totalSamples = this.sampleChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.sampleChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const url = URL.createObjectURL(encodeWavFromFloat32(merged, SAMPLE_RATE));
    const audio = new Audio(url);
    audio.preservesPitch = true;
    audio.addEventListener('ended', () => {
      if (!this.disposed) {
        this.setState('ended');
      }
    });

    this.audioElement = audio;
    this.audioElementUrl = url;
    return audio;
  }

  /**
   * Creates the `AudioContext` (if not already created) and resumes it. Browsers such as Safari
   * only let an `AudioContext` leave the `suspended` state when `resume()` is called synchronously
   * within a user-gesture event handler, so callers must invoke this directly inside their click
   * handler, before awaiting anything, then pass the stream to `start()` once it's available.
   */
  unlockAudioContext(): void {
    void this.ensureAudioContext().resume();
  }

  private ensureAudioContext(): AudioContext {
    if (this.audioContext) {
      return this.audioContext;
    }
    const audioContext = new AudioContext();
    this.audioContext = audioContext;
    this.scheduledUntil = audioContext.currentTime;
    this.playbackStartContextTime = audioContext.currentTime;
    this.playbackStartOffset = 0;
    return audioContext;
  }

  /** Starts consuming the chunk stream, decoding and scheduling audio as it arrives. */
  async start(chunks: AsyncIterable<Uint8Array<ArrayBufferLike>>): Promise<void> {
    this.setState('loading');
    this.ensureAudioContext();

    try {
      for await (const chunk of chunks) {
        if (this.disposed) {
          return;
        }
        this.scheduleChunk(chunk);
        if (this.state === 'loading') {
          this.setState(this.pausedBeforePlaying ? 'paused' : 'playing');
        }
      }
      this.streamDone = true;
      this.callbacks.onDurationKnown?.(this.duration);
      if (this.pendingSourceCount === 0 && !this.disposed) {
        this.setState('ended');
      }
    } catch (error) {
      if (!this.disposed) {
        this.setState('error');
      }
      throw error;
    }
  }

  private scheduleChunk(bytes: Uint8Array<ArrayBufferLike>): void {
    const audioContext = this.audioContext;
    if (!audioContext) {
      return;
    }

    const { samples, leftover } = decodePcm16ToFloat32(bytes, this.leftoverBytes);
    this.leftoverBytes = leftover;
    if (samples.length === 0) {
      return;
    }

    const audioBuffer = audioContext.createBuffer(CHANNELS, samples.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(samples, 0);
    this.duration += audioBuffer.duration;
    this.sampleChunks.push(samples);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const startAt = Math.max(this.scheduledUntil, audioContext.currentTime);
    source.start(startAt);
    this.scheduledUntil = startAt + audioBuffer.duration;

    this.activeSources.push(source);
    this.pendingSourceCount += 1;
    source.onended = () => {
      this.activeSources = this.activeSources.filter((activeSource) => activeSource !== source);
      this.pendingSourceCount -= 1;
      if (this.streamDone && this.pendingSourceCount === 0 && !this.disposed) {
        this.setState('ended');
      }
    };
  }

  /** Pauses the whole AudioContext clock (or the audio element, once handed off); incoming chunks
   * (if the stream is still open) keep being decoded and scheduled in the background so resuming
   * is instant. If called while still 'idle'/'loading' (a request superseded before its first
   * chunk arrived), the intent is latched so playback never becomes audible once scheduling
   * starts, rather than being silently ignored. */
  pause(): void {
    if (this.state === 'idle' || this.state === 'loading') {
      this.pausedBeforePlaying = true;
      void this.audioContext?.suspend();
      return;
    }
    if (this.state !== 'playing') {
      return;
    }
    if (this.audioElement) {
      this.audioElement.pause();
    } else {
      void this.audioContext?.suspend();
    }
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') {
      return;
    }
    this.pausedBeforePlaying = false;
    if (this.audioElement) {
      void this.audioElement.play();
    } else {
      void this.audioContext?.resume();
    }
    this.setState('playing');
  }

  dispose(): void {
    this.disposed = true;
    void this.audioContext?.close();
    this.audioContext = null;
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    if (this.audioElementUrl) {
      URL.revokeObjectURL(this.audioElementUrl);
      this.audioElementUrl = null;
    }
    this.audioElement = null;
  }

  private setState(state: PcmPlayerState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}
