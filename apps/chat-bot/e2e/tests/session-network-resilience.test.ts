import { expect, test } from '../fixtures/test';
import { AUTH_FILES } from '../utils/const';
import { focusPage } from '../utils/browser';

test.use({ storageState: AUTH_FILES.teacher });

/**
 * Tests for ResilientSessionProvider and SessionWatcher resilience to network failures.
 *
 * ResilientSessionProvider intercepts fetch requests to /api/auth/session and:
 * 1. Caches valid sessions
 * 2. Returns cached session on network errors or 5xx responses (transient failures)
 * 3. Keeps NextAuth in 'authenticated' state so polling continues
 * 4. Allows genuine logout (200 with null) and 4xx errors to proceed normally
 *
 * SessionWatcher redirects when NextAuth reports 'unauthenticated' status.
 *
 * Expected behavior:
 * - Network failures (abort, 502, 503, etc.) → SHOULD NOT redirect (cached session used)
 * - Genuine logout (200 with null session) → SHOULD redirect to logout
 */
test.describe('ResilientSessionProvider and SessionWatcher', () => {
  test('keeps session alive on network failure (user offline)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();

    // Simulate network failure (user offline) by aborting requests
    await page.route('**/api/auth/session', (route) => {
      route.abort('failed');
    });

    // Trigger refetch - should use cached session and not redirect
    const sessionRequestPromise = page.waitForRequest('**/api/auth/session');
    await focusPage(page);
    await sessionRequestPromise;

    // Should still be on same page, NOT redirected
    expect(page.url()).toBe(initialUrl);
    expect(page.url()).not.toContain('/logout');
  });

  test('keeps session alive on infrastructure error (502 Bad Gateway)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();

    // Simulate 502 Bad Gateway (infrastructure error)
    await page.route('**/api/auth/session', (route) => {
      route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>',
      });
    });

    // Trigger refetch - should use cached session and not redirect
    const sessionResponsePromise = page.waitForResponse('**/api/auth/session');
    await focusPage(page);
    await sessionResponsePromise;

    // Should not redirect
    expect(page.url()).toBe(initialUrl);
    expect(page.url()).not.toContain('/logout');
  });

  test('NextAuth polling continues working with cached session', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();

    let requestCount = 0;
    await page.route('**/api/auth/session', (route) => {
      requestCount++;
      if (requestCount === 1) {
        // First request succeeds
        route.continue();
      } else {
        // Subsequent requests fail (infrastructure down)
        route.abort('failed');
      }
    });

    // Wait and trigger multiple refetches via focus
    const req1 = page.waitForRequest('**/api/auth/session');
    await focusPage(page);
    await req1;

    const req2 = page.waitForRequest('**/api/auth/session');
    await focusPage(page);
    await req2;

    const req3 = page.waitForRequest('**/api/auth/session');
    await focusPage(page);
    await req3;

    // Multiple refetch attempts should have been made (polling is still active)
    expect(requestCount).toBeGreaterThan(1);

    // Should still be on same page (not logged out)
    expect(page.url()).toBe(initialUrl);
  });

  test('triggers logout redirect on genuine session invalidation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    let requestCount = 0;
    // Only return null after the first request (which establishes the session)
    await page.route('**/api/auth/session', (route) => {
      requestCount++;
      if (requestCount === 1) {
        // Let first request through to establish session
        route.continue();
      } else {
        // Subsequent requests: genuine logout - 200 with null session
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(null),
        });
      }
    });

    // Trigger refetch - this will get the null response
    const sessionResponsePromise = page.waitForResponse('**/api/auth/session');
    await focusPage(page);
    await sessionResponsePromise;

    // Should redirect to logout
    await page.waitForURL(/\/(logout|login)/);
    expect(page.url()).toMatch(/\/(logout-callback|login)/);
  });

  test('recovers when infrastructure comes back online', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const initialUrl = page.url();

    let failureCount = 0;
    const maxFailures = 2;

    await page.route('**/api/auth/session', (route) => {
      failureCount++;
      if (failureCount <= maxFailures) {
        // Infrastructure down - return 502
        route.fulfill({
          status: 502,
          contentType: 'text/html',
          body: '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1></body></html>',
        });
      } else {
        // Infrastructure recovered - allow normal response
        route.continue();
      }
    });

    // First refetch - infrastructure down, uses cache
    const resp1 = page.waitForResponse('**/api/auth/session');
    await focusPage(page);
    await resp1;
    expect(page.url()).toBe(initialUrl);

    // Second refetch - still down, uses cache
    const resp2 = page.waitForResponse('**/api/auth/session');
    await focusPage(page);
    await resp2;
    expect(page.url()).toBe(initialUrl);

    // Third refetch - infrastructure back, should get fresh session
    const resp3 = page.waitForResponse('**/api/auth/session');
    await focusPage(page);
    await resp3;

    // Should still be authenticated and on same page
    expect(page.url()).toBe(initialUrl);
    expect(failureCount).toBeGreaterThanOrEqual(3);
  });
});
