let unlocked = false;

/**
 * Resumes a throwaway `AudioContext` synchronously, which must be called directly inside a user
 * gesture handler (e.g. a message submit), before any `await`. Browsers such as Safari only allow
 * an `AudioContext` to leave the `suspended` state this way; once the page has been unlocked like
 * this, contexts created later outside a gesture (e.g. for autoplaying a speech-only reply once it
 * finishes streaming) start already running instead of silently staying suspended.
 *
 * Called unconditionally from the chat input submit handler: it runs at most once per page and
 * needs no knowledge of the speech settings, so no chat surface can forget to unlock.
 */
export function unlockAudioPlayback(): void {
  if (unlocked) {
    return;
  }
  unlocked = true;
  const context = new AudioContext();
  void context.resume().finally(() => void context.close());
}
