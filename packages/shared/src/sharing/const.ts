/**
 * Configuration constants for share session expiration and grace periods.
 */

/**
 * Grace period (in hours) after a share session expires during which
 * the teacher can still extend the session or adjust token limits.
 *
 * After this window closes, the share is considered permanently expired
 * and a new share session must be started.
 *
 * Value: 2 hours
 */
const SHARE_EXTENSION_WINDOW_HOURS = 2;

/**
 * Same as SHARE_EXTENSION_WINDOW_HOURS, but in milliseconds for readability.
 * Value: 2 hours = 7,200,000 milliseconds
 */
export const SHARE_EXTENSION_WINDOW_MS = SHARE_EXTENSION_WINDOW_HOURS * 60 * 60 * 1000;

export const MAX_SHARE_USAGE_TIME_LIMIT_IN_MINUTES = 130 * 24 * 60;

export const MAX_EXTENDABLE_USAGE_TIME_IN_SECONDS = 100 * 24 * 60 * 60; // 100 days

/**
 * How long after a share is resolved (expired past its extension window, or manually stopped)
 * its files are kept before `cleanupExpiredSharedChatFiles` considers them safe to delete. File
 * deletion is irreversible, so this adds an extra 24 hours on top of the share extension window.
 *
 * Value: SHARE_EXTENSION_WINDOW_HOURS (2) + 24 = 26 hours
 */
const SHARE_FILE_CLEANUP_DELAY_HOURS = SHARE_EXTENSION_WINDOW_HOURS + 24;

export const SHARE_FILE_CLEANUP_DELAY_MS = SHARE_FILE_CLEANUP_DELAY_HOURS * 60 * 60 * 1000;
