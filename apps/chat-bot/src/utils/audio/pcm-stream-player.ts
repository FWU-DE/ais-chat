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

export type PcmPlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

const SAMPLE_RATE = 24_000;
const CHANNELS = 1;

/**
 * Plays a stream of raw 16-bit PCM (24 kHz, mono) chunks as they arrive, using the Web Audio API
 * instead of `<audio>`/MediaSource Extensions (MSE doesn't support headerless raw PCM as a
 * demuxable source). Chunks are scheduled back-to-back against the AudioContext clock for gapless
 * playback, and every decoded chunk is kept (not discarded after playing) so pause/resume works
 * via `AudioContext.suspend()/resume()` without re-fetching anything, and so seeking (once the
 * whole stream has been received) can rebuild a single buffer and jump to an arbitrary offset.
 */
export class PcmStreamPlayer {
  private audioContext: AudioContext | null = null;
  private scheduledUntil = 0;
  private leftoverBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private activeSources: AudioBufferSourceNode[] = [];
  private pendingSourceCount = 0;
  private streamDone = false;
  private state: PcmPlayerState = 'idle';
  private disposed = false;
  private duration = 0;
  private sampleChunks: Float32Array<ArrayBuffer>[] = [];
  private fullBuffer: AudioBuffer | null = null;
  // Reference point the current playback position is derived from: `playbackStartOffset` is the
  // buffer time (seconds into the full stream) that corresponded to the AudioContext clock reading
  // `playbackStartContextTime`. Since the clock doesn't advance while suspended, this also keeps
  // the position correct across pause/resume for free.
  private playbackStartContextTime = 0;
  private playbackStartOffset = 0;

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
    const audioContext = this.audioContext;
    if (!audioContext || this.state === 'idle' || this.state === 'loading') {
      return 0;
    }
    if (this.state === 'ended') {
      return this.duration;
    }
    const elapsed =
      this.playbackStartOffset + (audioContext.currentTime - this.playbackStartContextTime);
    return Math.min(Math.max(elapsed, 0), this.duration);
  }

  /**
   * Jumps playback to `time` seconds into the stream. Only available once the whole stream has
   * been received (so the full audio is already decoded locally); a no-op otherwise.
   */
  seek(time: number): void {
    const audioContext = this.audioContext;
    if (!audioContext || !this.streamDone || this.disposed) {
      return;
    }
    const clamped = Math.min(Math.max(time, 0), this.duration);

    for (const source of this.activeSources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.activeSources = [];
    this.pendingSourceCount = 0;

    const source = audioContext.createBufferSource();
    source.buffer = this.getOrBuildFullBuffer(audioContext);
    source.connect(audioContext.destination);
    source.start(audioContext.currentTime, clamped);

    this.playbackStartContextTime = audioContext.currentTime;
    this.playbackStartOffset = clamped;
    this.scheduledUntil = audioContext.currentTime + (this.duration - clamped);

    this.activeSources.push(source);
    this.pendingSourceCount = 1;
    source.onended = () => {
      this.activeSources = this.activeSources.filter((activeSource) => activeSource !== source);
      this.pendingSourceCount -= 1;
      if (this.pendingSourceCount === 0 && !this.disposed) {
        this.setState('ended');
      }
    };

    this.setState(audioContext.state === 'suspended' ? 'paused' : 'playing');
  }

  private getOrBuildFullBuffer(audioContext: AudioContext): AudioBuffer {
    if (this.fullBuffer) {
      return this.fullBuffer;
    }
    const totalSamples = this.sampleChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.sampleChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const buffer = audioContext.createBuffer(CHANNELS, merged.length, SAMPLE_RATE);
    buffer.copyToChannel(merged, 0);
    this.fullBuffer = buffer;
    return buffer;
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
          this.setState('playing');
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

  /** Pauses the whole AudioContext clock; incoming chunks (if the stream is still open) keep
   * being decoded and scheduled in the background so resuming is instant. */
  pause(): void {
    if (this.state !== 'playing') {
      return;
    }
    void this.audioContext?.suspend();
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') {
      return;
    }
    void this.audioContext?.resume();
    this.setState('playing');
  }

  dispose(): void {
    this.disposed = true;
    void this.audioContext?.close();
    this.audioContext = null;
  }

  private setState(state: PcmPlayerState): void {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}
