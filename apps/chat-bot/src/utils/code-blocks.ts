const TITLE_PATTERN = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/;

// The fence info string (`js title="Titel"`) is split by the markdown libraries,
// only the `title="…"` attribute (the common docs convention) is read from it.
export function getCodeTitle(meta: string | undefined) {
  const match = meta === undefined ? null : TITLE_PATTERN.exec(meta);
  const title = (match?.[1] ?? match?.[2])?.trim();
  return title || undefined;
}
