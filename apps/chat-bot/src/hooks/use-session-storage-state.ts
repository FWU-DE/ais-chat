'use client';

import { useCallback, useSyncExternalStore } from 'react';

const SESSION_STORAGE_CHANGE_EVENT = 'ais-chat:session-storage-change';
const SERVER_SNAPSHOT = Symbol('server-snapshot');

// Keeps values usable for the current page load when sessionStorage access is blocked.
const memoryFallback = new Map<string, string>();

function subscribe(callback: () => void) {
  window.addEventListener(SESSION_STORAGE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(SESSION_STORAGE_CHANGE_EVENT, callback);
}

export function readSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

/** Writes to sessionStorage and notifies all `useSessionStorageState` instances. */
export function writeSessionStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    memoryFallback.set(key, value);
  }
  window.dispatchEvent(new Event(SESSION_STORAGE_CHANGE_EVENT));
}

/**
 * Reads a sessionStorage entry as external store state.
 * `parse` receives the raw stored value (null if missing) and runs on the client only;
 * the server render and hydration use `serverValue`.
 */
export function useSessionStorageState<T>(
  key: string,
  parse: (raw: string | null) => T,
  serverValue: T,
): [T, (raw: string) => void] {
  const snapshot = useSyncExternalStore<string | null | typeof SERVER_SNAPSHOT>(
    subscribe,
    () => readSessionStorage(key),
    () => SERVER_SNAPSHOT,
  );
  const value = snapshot === SERVER_SNAPSHOT ? serverValue : parse(snapshot);

  const setValue = useCallback((raw: string) => writeSessionStorage(key, raw), [key]);

  return [value, setValue];
}
