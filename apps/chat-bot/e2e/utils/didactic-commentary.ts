import { expect, Page } from '@playwright/test';
import { waitForAutosave } from './utils';

export async function verifyDidacticCommentary(
  page: Page,
  viewBasePath: string,
  expectedTooltip: string,
) {
  const editorUrl = page.url();
  const entityId = new URL(editorUrl).pathname.split('/').pop();
  const comment = 'Hinweise für den Einsatz im Unterricht';
  const heading = 'Didaktischer Kommentar';

  const toggle = page.getByTestId('didactic-commentary-toggle');
  const input = page.getByTestId('didactic-commentary-input');
  const infoTooltipTrigger = page
    .getByRole('heading', { name: heading })
    .locator('..')
    .getByRole('button');

  // An empty didactic commentary renders nothing in the read-only view
  await page.goto(`${viewBasePath}/${entityId}`);
  await expect(page.getByText(heading, { exact: true })).toHaveCount(0);

  await page.goto(editorUrl);
  await expect(input).toBeHidden();

  // Radix only registers the collapsible's click handler once the editor has hydrated.
  // A click that lands before that is silently dropped, so retry while it stays closed.
  await expect(toggle).toHaveAttribute('data-state', 'closed');
  await expect(async () => {
    if ((await toggle.getAttribute('data-state')) === 'closed') {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute('data-state', 'open', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(input).toBeVisible();

  await expect(async () => {
    await infoTooltipTrigger.click();
    await expect(page.getByText(expectedTooltip, { exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press('Escape');

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-state', 'closed');
  await expect(input).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('data-state', 'open');
  await input.fill(`${comment}   \n `);
  await input.press('Tab');
  await waitForAutosave(page);
  await page.reload();

  // saved text is trimmed and the section starts expanded
  await expect(input).toHaveValue(comment);

  await page.goto(`${viewBasePath}/${entityId}`);
  await expect(page.getByText(heading, { exact: true })).toBeVisible();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();

  await page.goto(editorUrl);
  await expect(input).toHaveValue(comment);
}
