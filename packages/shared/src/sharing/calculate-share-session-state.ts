import { SHARE_EXTENSION_WINDOW_MS } from '@shared/sharing/const';

/**
 * Share session states based on expiration and manual stop status.
 */
export enum ShareSessionState {
  /** Share is currently running (expiredAt is in the future) */
  RUNNING = 'running',
  /** Share has expired but is still within the 2-hour grace window (can still extend) */
  EXPIRED_RECENTLY = 'expired_recently',
  /** Share has been manually stopped (cannot extend) */
  STOPPED = 'stopped',
  /** Share has expired permanently (past 2-hour window) or no share exists */
  EXPIRED_PERMANENTLY = 'expired_permanently',
}

/**
 * Calculates the state of a share session, accounting for the 2-hour grace period
 * after expiration during which the session can still be extended.
 *
 * @returns Object containing:
 *   - shareSessionState: The current state of the share session
 *   - timeLeftInSeconds: Time remaining in seconds (can be negative for expired sessions)
 *   - isExtendable: Whether the session can still be extended
 */
export function calculateShareSessionState(
  {
    expiredAt,
    manuallyStoppedAt,
  }: {
    expiredAt: Date | null;
    manuallyStoppedAt?: Date | null;
  },
  now: Date = new Date(),
): {
  shareSessionState: ShareSessionState;
  timeLeftInSeconds: number;
  isExtendable: boolean;
} {
  // Session was manually stopped - never extendable
  if (manuallyStoppedAt) {
    return {
      shareSessionState: ShareSessionState.STOPPED,
      timeLeftInSeconds: -1,
      isExtendable: false,
    };
  }

  // No share exists
  if (expiredAt === null) {
    return {
      shareSessionState: ShareSessionState.EXPIRED_PERMANENTLY,
      timeLeftInSeconds: -1,
      isExtendable: false,
    };
  }

  const expiredAtDate = new Date(expiredAt);
  const nowMs = now.getTime();

  const timeLeftInMs = expiredAtDate.getTime() - nowMs;
  const timeLeftInSeconds = Math.floor(timeLeftInMs / 1000);

  // Session is still running (not yet expired)
  if (timeLeftInMs > 0) {
    return {
      shareSessionState: ShareSessionState.RUNNING,
      timeLeftInSeconds,
      isExtendable: true,
    };
  }

  // Session has expired - check if it's within the grace window
  const timeSinceExpirationMs = Math.abs(timeLeftInMs);

  if (timeSinceExpirationMs < SHARE_EXTENSION_WINDOW_MS) {
    // Within grace window - still extendable
    return {
      shareSessionState: ShareSessionState.EXPIRED_RECENTLY,
      timeLeftInSeconds, // Will be negative
      isExtendable: true,
    };
  }

  // Expired beyond grace window - not extendable
  return {
    shareSessionState: ShareSessionState.EXPIRED_PERMANENTLY,
    timeLeftInSeconds,
    isExtendable: false,
  };
}

/**
 * Calculates the time remaining until a shared session expires permanently.
 * This is only relevant when the share is in the grace period (EXPIRED_RECENTLY).
 *
 * @param expiredAt - The expiration date of the share
 * @returns Time remaining in the grace period in seconds, or 0 if permanently expired/no share
 */
export function calculateGracePeriodTimeLeftInSeconds(expiredAt: Date | null): number {
  if (expiredAt === null) {
    return 0;
  }

  const expiredAtDate = new Date(expiredAt);
  const nowMs = Date.now();

  // Grace period ends at: expiredAt + 2 hours
  const gracePeriodEndMs = expiredAtDate.getTime() + SHARE_EXTENSION_WINDOW_MS;
  const timeUntilGracePeriodEndMs = gracePeriodEndMs - nowMs;

  // Return 0 if grace period has ended
  return Math.max(0, Math.floor(timeUntilGracePeriodEndMs / 1000));
}
