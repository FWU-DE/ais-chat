import type { Mp3Frame } from './mp3-frames';

const PEAKS_PER_SECOND = 100;
// Decoding in slices keeps memory bounded; a 40 min clip decoded at once needs hundreds of MB.
const SLICE_SECONDS = 30;
const DECODE_SAMPLE_RATE = 22_050;

function sliceFrames(frames: Mp3Frame[]): Mp3Frame[][] {
  const slices: Mp3Frame[][] = [];
  let current: Mp3Frame[] = [];
  let currentDuration = 0;

  for (const frame of frames) {
    current.push(frame);
    currentDuration += frame.duration;
    if (currentDuration >= SLICE_SECONDS) {
      slices.push(current);
      current = [];
      currentDuration = 0;
    }
  }
  if (current.length > 0) slices.push(current);

  return slices;
}

function appendPeaks(peaks: number[], samples: Float32Array, windowSize: number): void {
  for (let start = 0; start < samples.length; start += windowSize) {
    const end = Math.min(start + windowSize, samples.length);
    let peak = 0;
    for (let index = start; index < end; index++) {
      const value = Math.abs(samples[index] ?? 0);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }
}

/**
 * Computes absolute peak amplitudes at `PEAKS_PER_SECOND` resolution by decoding the MP3 slice by
 * slice. Returns null if decoding fails (the waveform then stays flat, playback is unaffected).
 */
export async function computeWaveformPeaks(
  bytes: Uint8Array,
  frames: Mp3Frame[],
): Promise<Float32Array | null> {
  try {
    // An offline context decodes without touching audio hardware or autoplay policies.
    const context = new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE);
    const peaks: number[] = [];

    for (const slice of sliceFrames(frames)) {
      const first = slice[0];
      const last = slice.at(-1);
      if (!first || !last) continue;

      // `decodeAudioData` detaches the buffer it receives, so each slice gets its own copy.
      const data = bytes.slice(first.offset, last.offset + last.length);
      const decoded = await context.decodeAudioData(data.buffer);
      const windowSize = Math.max(1, Math.round(decoded.sampleRate / PEAKS_PER_SECOND));
      appendPeaks(peaks, decoded.getChannelData(0), windowSize);
    }

    return peaks.length > 0 ? Float32Array.from(peaks) : null;
  } catch {
    return null;
  }
}
