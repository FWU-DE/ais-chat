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
 * Extra buffer (on top of the share extension window already baked into
 * `calculateShareSessionState`) before a resolved share's files are considered safe to delete.
 * File deletion is irreversible, so this is larger than the UI's own extension grace period.
 *
 * Value: 24 hours
 */
const CLEANUP_SAFETY_BUFFER_HOURS = 24;

export const CLEANUP_SAFETY_BUFFER_MS = CLEANUP_SAFETY_BUFFER_HOURS * 60 * 60 * 1000;
