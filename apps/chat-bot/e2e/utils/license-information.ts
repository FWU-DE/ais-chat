import { expect, Page } from '@playwright/test';
import { waitForAutosave } from './utils';

export async function verifyLicenseInformation(page: Page, viewBasePath: string) {
  const editorUrl = page.url();
  const entityId = new URL(editorUrl).pathname.split('/').pop();
  const licenseText = 'Bild von Max Mustermann, CC BY 4.0';

  const toggle = page.getByTestId('license-information-toggle');
  const input = page.getByTestId('license-information-input');
  const copyrightLink = page.getByRole('link', { name: 'Übersicht zum Urheberrecht' });

  await expect(input).toBeHidden();
  await expect(copyrightLink).toBeHidden();

  await toggle.click();
  await expect(input).toBeVisible();
  await expect(copyrightLink).toBeVisible();

  await toggle.click();
  await expect(input).toBeHidden();
  await expect(copyrightLink).toBeHidden();

  await toggle.click();
  await input.fill(`${licenseText}   \n `);
  await input.press('Tab');
  await waitForAutosave(page);
  await page.reload();

  // saved text is trimmed and the section starts expanded
  await expect(input).toHaveValue(licenseText);

  await page.goto(`${viewBasePath}/${entityId}`);
  await expect(page.getByText(licenseText)).toBeVisible();

  await page.goto(editorUrl);
  await expect(input).toHaveValue(licenseText);
}
