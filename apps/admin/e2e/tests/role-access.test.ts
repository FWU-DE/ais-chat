import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function login(page: Page, username: 'admin' | 'editor') {
  await page.goto('/');
  await page.getByRole('button', { name: /keycloak/i }).click();
  await page.waitForURL(/\/protocol\/openid-connect\/auth/);
  await page.getByLabel('Username').fill(username);
  await page.getByRole('textbox', { name: 'Password' }).fill('password');
  await page.locator('button[type="submit"]').click();
}

test.describe('admin role access', () => {
  test('allows an Admin to access the API administration and all app navigation', async ({
    page,
  }) => {
    await login(page, 'admin');

    await expect(page).toHaveURL('/');
    await expect(page.getByText('Willkommen bei AIS.chat-admin.')).toBeVisible();
    await expect(page.getByText('Rolle: Admin')).toBeVisible();
    await expect(page.getByRole('link', { name: 'AIS.chat-api' })).toBeVisible();

    await page.goto('/ais-chat-app');
    await expect(page.getByRole('link', { name: 'Bundesländer' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vorlagen' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sperrungen' })).toBeVisible();
  });

  test('redirects an Editor to the app administration and hides Admin-only navigation', async ({
    page,
  }) => {
    await login(page, 'editor');

    await expect(page).toHaveURL('/ais-chat-app');
    await expect(page.getByText('Rolle: Editor')).toBeVisible();
    await expect(page.getByRole('link', { name: 'AIS.chat-api' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Bundesländer' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Vorlagen' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sperrungen' })).toBeVisible();
  });

  test('redirects the logout callback to the application root', async ({ request }) => {
    const response = await request.get('/api/auth/logout-callback', { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe('http://localhost:3001/');
  });
});
