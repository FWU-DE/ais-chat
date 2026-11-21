'use client';

import { useEffect, useRef } from 'react';

const ENTRY_ID_STATE_KEY = '__editorEntryId';

// Lives as long as the document, so a hard reload starts empty while client-side navigation keeps it.
const entryIdsMarkedInThisDocument = new Set<string>();

/**
 * Hook that forces a page reload when the user navigates back to it using the browser's back button.
 * This is useful for pages that have forms with input fields.
 * Otherwise old values are shown in the fields when the user goes back to the page.
 *
 * The current history entry gets an id on mount. Mounting on an entry whose id was already seen in
 * this document means the user came back via history, so the page reloads. No history entries are
 * added, and a hard reload does not trigger a second reload.
 */
export function useForceReloadOnBrowserBackButton(): void {
  const hasRunRef = useRef(false);

  useEffect(() => {
    // guards against the double effect invocation in React strict mode
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const state = window.history.state ?? {};
    const entryId: string | undefined = state[ENTRY_ID_STATE_KEY];

    if (entryId && entryIdsMarkedInThisDocument.has(entryId)) {
      window.location.reload();
      return;
    }

    const newEntryId = crypto.randomUUID();
    entryIdsMarkedInThisDocument.add(newEntryId);
    window.history.replaceState({ ...state, [ENTRY_ID_STATE_KEY]: newEntryId }, '');
  }, []);
}
