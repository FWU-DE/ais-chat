# Text to Speech

## Request flow

The client posts the text to `apps/chat-bot/src/app/api/v1/speech/stream/route.ts` (shared chats:
`apps/chat-bot/src/app/api/v1/shared-chat/speech/stream/route.ts`) and plays the returned chunked
MP3 response while it arrives (`Mp3StreamPlayer` in `apps/chat-bot/src/utils/audio/`, driven by
`use-audio-stream.ts`).

Server side:

1. `runSpeechPipeline` (`packages/shared/src/speech/streaming/speech-pipeline.ts`) checks access and
   token budget, then calls `startStream`, which stores and reports usage once the stream finished
   or was cancelled.
2. `streamSpeechById` (`packages/ai-core/src/speech/generate-stream.ts`) preprocesses and splits the
   text, then streams the segments.
3. The provider function (currently only Bifrost, `packages/ai-core/src/speech/providers/bifrost.ts`)
   requests `stream_format: 'sse'` and yields the base64-decoded MP3 deltas. Usage is only known
   after the last event.

## Splitting

Providers limit the input length of a single request, so the text is split before synthesis:

- `preprocessSpeechText` (`speech/text/preprocess.ts`) runs first, because it can change the text
  length. It is currently a pass-through; markdown, code block or URL handling belongs here.
- `splitSpeechText` (`speech/text/split.ts`) creates segments of at most `MAX_SPEECH_SEGMENT_CHARS`
  (4000) characters. It breaks at paragraphs, then sentences (`Intl.Segmenter`, German and English),
  then words, and cuts inside a word only if a single word exceeds the limit.

The limit is a code constant for all providers. Make it configurable per provider once a provider
needs a different value.

## Streaming segments

`streamSpeechSegments` (`speech/stream-segments.ts`) turns the segments into one MP3 chunk stream:

- Segments are requested strictly sequentially; the next request starts once the previous segment
  is fully received. As long as synthesis is faster than playback, the client buffer hides the gap.
- The first request is made before the response starts, so request errors become a regular error
  response. Later failures can only abort the running stream.
- MP3 frames are self-contained, so segment audio is concatenated without re-encoding. HTTP
  contract and client player do not know about segments.
- `SPEECH_SEGMENT_MAX_DURATION_MS` (60 s) applies to each segment, combined with the client's abort
  signal.
- Usage of all started segments is summed and resolved once when the stream ends or is cancelled,
  so billing sees a single usage.
- Errors are wrapped with the segment index (`segment 2/3`) and logged by the route. Audio received
  before the error keeps playing; the client then shows an error toast. Errors after a client abort
  are passed through unchanged.

Only the streaming path splits. `generateSpeechById` (non-streaming) still sends the whole text in
one request.

## Client playback

`Mp3StreamPlayer` (`apps/chat-bot/src/utils/audio/mp3-stream-player.ts`) plays the stream through
a `MediaSource` (`ManagedMediaSource` on iOS Safari) attached to an `<audio>` element.

- A `SourceBuffer` has a small quota (about 12 MB of audio in Chrome, roughly 15 minutes of speech).
  Appending beyond it throws `QuotaExceededError`, so the player never appends everything at once.
- The network stream is always read completely into memory, so the server is never slowed down by
  playback and its per-segment timeout keeps working.
- Only `MAX_BUFFER_AHEAD_SECONDS` (60 s) ahead of the playback position are appended; audio more
  than `KEEP_BUFFER_BEHIND_SECONDS` (10 s) behind is evicted. A `QuotaExceededError` evicts all played
  audio and retries after playback progressed.
- Seeking and speed changes are only available once the whole stream was received. Seeking to a
  position no longer in the source buffer switches the element to a Blob URL of the whole audio.
- Duration is computed by parsing the MP3 frame headers (`mp3-frames.ts`). The waveform is decoded
  in 30 s slices into peaks (`mp3-waveform.ts`), because decoding long audio at once needs hundreds
  of MB.
- Playback errors are logged via `logError` in `use-audio-stream.ts` before the error toast is shown.
