export type Mp3Frame = {
  offset: number;
  length: number;
  /** Playback duration of the frame in seconds. */
  duration: number;
};

// Indexed by the header's version bits: MPEG 2.5, reserved, MPEG 2, MPEG 1.
const SAMPLE_RATES: readonly (readonly number[])[] = [
  [11_025, 12_000, 8_000],
  [],
  [22_050, 24_000, 16_000],
  [44_100, 48_000, 32_000],
];
const LAYER3_BITRATES_KBPS_MPEG1 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const LAYER3_BITRATES_KBPS_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

/** Size of an ID3v2 tag starting at `offset`, or 0 if there is none. */
function id3v2TagSize(bytes: Uint8Array, offset: number): number {
  const byte = (index: number) => bytes[offset + index] ?? 0;
  if (byte(0) !== 0x49 || byte(1) !== 0x44 || byte(2) !== 0x33 || offset + 10 > bytes.length) {
    return 0;
  }
  const size =
    ((byte(6) & 0x7f) << 21) |
    ((byte(7) & 0x7f) << 14) |
    ((byte(8) & 0x7f) << 7) |
    (byte(9) & 0x7f);
  const hasFooter = (byte(5) & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

/** Reads the MPEG Layer III frame header at `offset`, or returns null if there is no valid frame. */
function readFrame(bytes: Uint8Array, offset: number): Mp3Frame | null {
  const byte = (index: number) => bytes[offset + index] ?? 0;
  if (byte(0) !== 0xff || (byte(1) & 0xe0) !== 0xe0) return null;

  const version = (byte(1) >> 3) & 0b11;
  const layer = (byte(1) >> 1) & 0b11;
  if (layer !== 0b01) return null;

  const isMpeg1 = version === 0b11;
  const bitrates = isMpeg1 ? LAYER3_BITRATES_KBPS_MPEG1 : LAYER3_BITRATES_KBPS_MPEG2;
  const bitrateKbps = bitrates[byte(2) >> 4];
  const sampleRate = SAMPLE_RATES[version]?.[(byte(2) >> 2) & 0b11];
  if (!bitrateKbps || !sampleRate) return null;

  const padding = (byte(2) >> 1) & 1;
  const samples = isMpeg1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrateKbps * 1000) / sampleRate) + padding;
  if (offset + length > bytes.length) return null;

  return { offset, length, duration: samples / sampleRate };
}

/** Locates all MP3 frames, skipping ID3v2 tags and resynchronizing after unexpected bytes. */
export function parseMp3Frames(bytes: Uint8Array): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let offset = 0;

  while (offset + 4 <= bytes.length) {
    const tagSize = id3v2TagSize(bytes, offset);
    if (tagSize > 0) {
      offset += tagSize;
      continue;
    }

    const frame = readFrame(bytes, offset);
    if (frame) {
      frames.push(frame);
      offset += frame.length;
    } else {
      offset++;
    }
  }

  return frames;
}

export function getMp3Duration(frames: Mp3Frame[]): number {
  return frames.reduce((sum, frame) => sum + frame.duration, 0);
}
