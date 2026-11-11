# Code Block Download

`MarkdownCode` (`apps/chat-bot/src/components/chat/markdown-code.tsx`) renders a `DownloadCodeButton`
next to the copy button. On click it resolves the file name with `getCodeFileName`
(`apps/chat-bot/src/utils/code-blocks.ts`), builds a Blob from the block
text and saves it with `downloadFileFromBlob`. The text is read at click time, so a block that is
still streaming downloads what has arrived so far. The content is never modified.

## File name

Only the `title="…"` attribute of the fence is read (the system prompt asks the model to put the
file name there). In this order:

1. A title that is a known file name is used as is (`hello.py`, `Dockerfile`, `.gitignore`).
2. Any other title gets the extension of the fence language (`Sortierfunktion` → `Sortierfunktion.py`).
3. Without a title the name is `code.<ext>`.

`<ext>` is the primary extension of the fence language. Unknown or missing languages use `.txt`.

Extensions, file names and language aliases come from the `linguist-languages` data (GitHub
Linguist), loaded with a dynamic import on the first download. Do not add hand-written lists, and do
not parse first-line comments or other fence attributes.

## Sanitizing

Browsers already sanitize the name of an `<a download>` (path separators, reserved, control and
invisible characters, Windows device names), so the title is not sanitized again. Only the length is
capped at 200 bytes, because Chromium silently saves nothing above ~245 bytes.

The Blob uses `application/octet-stream`: Chromium appends `.txt` to extension-less names such as
`Dockerfile` for `text/plain`. Extensions are deliberately not restricted: downloading scripts is the
purpose of the feature.
