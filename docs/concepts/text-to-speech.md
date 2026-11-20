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

## SSML rewrite

Markdown, tables, formulas and code are hard to read aloud. If the speech model's
`modelConfig.enableSsmlRewrite` is `true` (off by default, set in the admin model configuration),
the chat and shared-chat pipelines rewrite the text before synthesis. The external API and the
voice preview are not affected.

- `runSpeechPipeline` calls `rewriteTextToSsml` (`packages/shared/src/speech/ssml-rewrite/`) after
  the access and budget checks. It sends the whole text to the speech auxiliary model (static model
  role `speech-auxiliary`, falling back to the strong auxiliary model if unset or unavailable for the
  federal state) with a 30 s timeout and the client's abort signal.
- The model returns only the body of the `<voice>` element: one outer `<lang xml:lang>` with the
  main language, a `<p>` per block, and nested `<lang>` for foreign words. Prose is kept word for
  word; tables are read row by row, code is described, formulas are read in words.
- The rewrite is billed to the federal state's API key by `generateTextWithBilling` and stored as
  text usage via the strategy's `storeTextUsage` (conversation or shared chat usage), so it counts
  toward the user's budget.
- `streamSsmlSpeechById` (`packages/ai-core/src/speech/generate-stream.ts`) validates the body with
  `buildSsmlSegments` (`speech/ssml/segments.ts`): it must be well-formed XML and must not contain
  `<speak>`, `<voice>`, `<audio>` or `<mstts:backgroundaudio>`. The server builds the
  `<speak xml:lang>` wrapper (locale from the voice name prefix, default `de-DE`) and the `<voice>`
  element. Bifrost passes input starting with `<speak` to Azure unchanged.
- Long bodies are split between top-level blocks into documents of at most
  `MAX_SPEECH_SEGMENT_CHARS`; every segment repeats the outer `<lang>`. A single block above the
  limit fails the request.
- There is no fallback: a failing, timed-out or invalid rewrite fails the request with the regular
  speech error. Nothing is cached.

Azure bills SSML markup (except `<speak>` and `<voice>`) as characters.

## Splitting

Providers limit the input length of a single request, so the text is split before synthesis:

- `preprocessSpeechText` (`speech/text/preprocess.ts`) runs first, because it can change the text
  length. It is currently a pass-through; markdown, code block or URL handling belongs here.
- `splitSpeechText` (`speech/text/split.ts`) creates segments of at most `MAX_SPEECH_SEGMENT_CHARS`
  characters. It breaks at paragraphs, then sentences (`Intl.Segmenter`, German and English),
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

## External API

`POST /v1/audio/speech` is an OpenAI-compatible endpoint for the `openai` SDK's
`audio.speech.create` method. The authenticated route validates the request and delegates to the
API adapter. The adapter calls
`generateSpeechStreamByNameWithBilling`, which validates the model and voice before invoking
`streamSpeechForModel`.

The voice must be a configured voice name listed by `GET /v1/models` (custom `{ id }` voice
objects are not accepted). Input is trimmed, must be non-empty, and is limited to 4096 characters.
Only MP3 output is supported. Responses can be an audio stream or speech-audio SSE events.

Speech is billed per input character. Billing is finalized by the stream generator when generation
completes, is cancelled, or fails, so every request is billed exactly once. Quota exhaustion
returns an HTTP 429 response. Unlike text and image generation, speech input is not checked by a
safety model.

As with text and image generation, concurrent requests can exceed the budget slightly because quota
is checked before generation and billed after. Billing uses the characters reported by the
provider, which only arrive with the last event of a segment. A stream aborted by the client before
that is billed with 0 characters for the unfinished segment, although the provider may still charge
for it. This applies to the chat-bot as well and is a known, accepted gap. It is intentionally not
mentioned in the public API docs.
