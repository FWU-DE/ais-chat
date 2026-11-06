import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calculateGracePeriodTimeLeftInSeconds,
  calculateShareSessionState,
  ShareSessionState,
} from './calculate-share-session-state';
import { SHARE_EXTENSION_WINDOW_MS } from './const';

describe('calculateShareSessionState', () => {
  const now = new Date('2024-06-01T10:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('STOPPED state', () => {
    it('returns STOPPED state when manuallyStoppedAt is set', () => {
      const expiredAt = new Date(now.getTime() + 55 * 60_000); // expires in 55 minutes
      const result = calculateShareSessionState({
        expiredAt,
        manuallyStoppedAt: new Date(now.getTime() - 1000),
      });
      expect(result.shareSessionState).toBe(ShareSessionState.STOPPED);
      expect(result.timeLeftInSeconds).toBe(-1);
      expect(result.isExtendable).toBe(false);
    });

    it('returns STOPPED state when manuallyStoppedAt is set even with long remaining time', () => {
      const expiredAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000); // expires in 30 days
      const result = calculateShareSessionState({
        expiredAt,
        manuallyStoppedAt: now,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.STOPPED);
      expect(result.timeLeftInSeconds).toBe(-1);
      expect(result.isExtendable).toBe(false);
    });
  });

  describe('EXPIRED_PERMANENTLY state', () => {
    it('returns EXPIRED_PERMANENTLY when expiredAt is null', () => {
      const result = calculateShareSessionState({
        expiredAt: null,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_PERMANENTLY);
      expect(result.timeLeftInSeconds).toBe(-1);
      expect(result.isExtendable).toBe(false);
    });

    it('returns EXPIRED_PERMANENTLY when past the grace window', () => {
      // Expired 3 hours ago (beyond 2-hour grace window)
      const expiredAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_PERMANENTLY);
      expect(result.timeLeftInSeconds).toBeLessThan(0);
      expect(result.isExtendable).toBe(false);
    });

    it('returns EXPIRED_PERMANENTLY exactly at the grace-window boundary', () => {
      const expiredAt = new Date(now.getTime() - SHARE_EXTENSION_WINDOW_MS);
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_PERMANENTLY);
      expect(result.isExtendable).toBe(false);
    });
  });

  describe('RUNNING state', () => {
    it('returns RUNNING state when time limit has not been reached', () => {
      const expiredAt = new Date(now.getTime() + 30 * 60_000); // expires in 30 minutes
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.RUNNING);
      expect(result.timeLeftInSeconds).toBe(30 * 60); // 1800 seconds
      expect(result.isExtendable).toBe(true);
    });

    it('returns RUNNING state when the chat was just started', () => {
      const expiredAt = new Date(now.getTime() + 45 * 60_000); // expires in 45 minutes
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.RUNNING);
      expect(result.timeLeftInSeconds).toBe(45 * 60); // 2700 seconds
      expect(result.isExtendable).toBe(true);
    });

    it('returns RUNNING state with long expiration times', () => {
      const expiredAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // expires in 24 hours
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.RUNNING);
      expect(result.timeLeftInSeconds).toBeGreaterThan(0);
      expect(result.isExtendable).toBe(true);
    });
  });

  describe('EXPIRED_RECENTLY state (within grace window)', () => {
    it('returns EXPIRED_RECENTLY when expired but within grace window', () => {
      // Expired 30 minutes ago (within 2-hour grace window)
      const expiredAt = new Date(now.getTime() - 30 * 60_000);
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_RECENTLY);
      expect(result.timeLeftInSeconds).toBeLessThan(0);
      expect(result.isExtendable).toBe(true);
    });

    it('returns EXPIRED_RECENTLY at the boundary (just expired)', () => {
      // Expired exactly now
      const expiredAt = new Date(now.getTime());
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_RECENTLY);
      expect(result.timeLeftInSeconds).toBeLessThanOrEqual(0);
      expect(result.isExtendable).toBe(true);
    });

    it('returns EXPIRED_RECENTLY at the end of the grace window', () => {
      // Expired almost 2 hours ago (just before grace window ends)
      const expiredAt = new Date(now.getTime() - SHARE_EXTENSION_WINDOW_MS + 1000);
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_RECENTLY);
      expect(result.timeLeftInSeconds).toBeLessThan(0);
      expect(result.isExtendable).toBe(true);
    });

    it('returns EXPIRED_RECENTLY when expired 1 hour ago', () => {
      // Expired 1 hour ago (well within 2-hour grace window)
      const expiredAt = new Date(now.getTime() - 60 * 60 * 1000);
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_RECENTLY);
      expect(result.timeLeftInSeconds).toBeLessThan(0);
      expect(result.isExtendable).toBe(true);
    });
  });

  describe('edge cases and transitions', () => {
    it('transitions from RUNNING to EXPIRED_RECENTLY as time passes', () => {
      const expiredAt = new Date(now.getTime() + 1000); // expires in 1 second

      // Initially RUNNING
      let result = calculateShareSessionState({ expiredAt });
      expect(result.shareSessionState).toBe(ShareSessionState.RUNNING);
      expect(result.isExtendable).toBe(true);

      // Move time forward to after expiration but within grace window
      vi.advanceTimersByTime(2000);
      result = calculateShareSessionState({ expiredAt });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_RECENTLY);
      expect(result.isExtendable).toBe(true);

      // Move time forward beyond grace window
      vi.advanceTimersByTime(SHARE_EXTENSION_WINDOW_MS);
      result = calculateShareSessionState({ expiredAt });
      expect(result.shareSessionState).toBe(ShareSessionState.EXPIRED_PERMANENTLY);
      expect(result.isExtendable).toBe(false);
    });

    it('ignores manuallyStoppedAt when null or undefined', () => {
      const expiredAt = new Date(now.getTime() + 20 * 60_000); // expires in 20 minutes

      const withNull = calculateShareSessionState({
        expiredAt,
        manuallyStoppedAt: null,
      });

      const withUndefined = calculateShareSessionState({
        expiredAt,
        manuallyStoppedAt: undefined,
      });

      const withoutParam = calculateShareSessionState({
        expiredAt,
      });

      expect(withNull.shareSessionState).toBe(ShareSessionState.RUNNING);
      expect(withUndefined.shareSessionState).toBe(ShareSessionState.RUNNING);
      expect(withoutParam.shareSessionState).toBe(ShareSessionState.RUNNING);
    });

    it('calculates accurate timeLeftInSeconds for recent expirations', () => {
      const expiredAt = new Date(now.getTime() - 10 * 60_000); // expired 10 minutes ago
      const result = calculateShareSessionState({
        expiredAt,
      });
      expect(result.timeLeftInSeconds).toBe(-10 * 60); // -600 seconds
      expect(result.isExtendable).toBe(true);
    });

    it('evaluates state as of an explicit reference date instead of the current time', () => {
      const expiredAt = new Date(now.getTime() - 30 * 60_000); // expired 30 minutes before `now`

      // As of the real current time, still within the grace window
      expect(calculateShareSessionState({ expiredAt }).shareSessionState).toBe(
        ShareSessionState.EXPIRED_RECENTLY,
      );

      // As of a reference date 3 hours after `now`, the grace window has long passed
      const referenceDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      expect(calculateShareSessionState({ expiredAt }, referenceDate).shareSessionState).toBe(
        ShareSessionState.EXPIRED_PERMANENTLY,
      );
    });
  });

  describe('calculateGracePeriodTimeLeftInSeconds', () => {
    it('returns full grace period when just expired', () => {
      const expiredAt = new Date(now.getTime());
      const result = calculateGracePeriodTimeLeftInSeconds(expiredAt);
      expect(result).toBe(SHARE_EXTENSION_WINDOW_MS / 1000);
    });

    it('returns remaining grace period when expired recently', () => {
      const expiredAt = new Date(now.getTime() - 30 * 60_000); // expired 30 minutes ago
      const result = calculateGracePeriodTimeLeftInSeconds(expiredAt);
      expect(result).toBe((SHARE_EXTENSION_WINDOW_MS - 30 * 60_000) / 1000);
    });

    it('returns 0 exactly at grace-window boundary', () => {
      const expiredAt = new Date(now.getTime() - SHARE_EXTENSION_WINDOW_MS);
      const result = calculateGracePeriodTimeLeftInSeconds(expiredAt);
      expect(result).toBe(0);
    });

    it('returns 0 when beyond grace window', () => {
      const expiredAt = new Date(now.getTime() - SHARE_EXTENSION_WINDOW_MS - 1000);
      const result = calculateGracePeriodTimeLeftInSeconds(expiredAt);
      expect(result).toBe(0);
    });

    it('returns 0 when no expiration date exists', () => {
      const result = calculateGracePeriodTimeLeftInSeconds(null);
      expect(result).toBe(0);
    });
  });
});
