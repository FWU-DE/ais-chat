import { expect, test } from '../fixtures/test';
import { AUTH_FILES } from '../utils/const';
import { login } from '../utils/login';

test.use({ storageState: AUTH_FILES.teacher });

const TEST_KEY = 'dismissed-info-banner-ids';
const TEST_VALUE = JSON.stringify(['test-banner-id']);

async function setTestData(page: Parameters<typeof login>[0]) {
  await page.waitForFunction(() => sessionStorage.getItem('login_session_id') !== null);
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: TEST_KEY,
    value: TEST_VALUE,
  });
  expect(await page.evaluate((key) => sessionStorage.getItem(key), TEST_KEY)).toBe(TEST_VALUE);
}

test('sessionStorage is cleared on logout', async ({ page }) => {
  await page.goto('/');
  await setTestData(page);

  await page.goto('/logout');
  await page.waitForURL('/login');

  // SessionClearer detects logout → clears sessionStorage
  await page.waitForFunction(() => sessionStorage.getItem('login_session_id') === null);

  expect(await page.evaluate((key) => sessionStorage.getItem(key), TEST_KEY)).toBeNull();
});

test('sessionStorage is cleared after logout and re-login in the same tab', async ({ page }) => {
  await page.goto('/');
  await setTestData(page);

  const sessionIdBeforeLogin = await page.evaluate(() =>
    sessionStorage.getItem('login_session_id'),
  );

  // Clear cookies only (no server-side logout) and re-login via vidis_idp_hint to get a new session.
  await login(page, 'teacher', 'password', {
    logout: false,
    idpHint: true,
  });

  // SessionClearer detects new login → clears and re-sets login_session_id
  await page.waitForFunction(
    (prevId) => sessionStorage.getItem('login_session_id') !== prevId,
    sessionIdBeforeLogin,
  );

  expect(await page.evaluate((key) => sessionStorage.getItem(key), TEST_KEY)).toBeNull();
});
