import { Page } from '@playwright/test';

/**
 * Logs into the admin app (port 3001) via Keycloak.
 *
 * The admin app does not use the VIDIS IDP hint flow of the chat-bot; it shows a
 * Keycloak login button and a standard username/password form. After a successful
 * login, editors are redirected to `/ais-chat-app` and admins to `/`.
 *
 * The page's context must use the admin base URL (`ADMIN_BASE_URL`).
 */
export async function adminLogin(
  page: Page,
  user: 'admin' | 'editor',
  password = 'password',
): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: /keycloak/i }).click();
  await page.waitForURL(/\/protocol\/openid-connect\/auth/);
  await page.getByLabel('Username').fill(user);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL(user === 'editor' ? '**/ais-chat-app' : /localhost:3001\/$/);
}
