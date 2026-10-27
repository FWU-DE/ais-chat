import { expect, test } from '@playwright/test';
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacherWithSettings });

test(
  'persists speech settings when the settings dialog closes',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'profileDropdown' }).click();
    await page.getByRole('menuitem', { name: 'Einstellungen' }).click();

    const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
    await expect(dialog).toBeVisible();

    const voiceSelect = dialog.getByRole('combobox', {
      name: 'Standardstimme der Sprachausgabe',
    });
    await voiceSelect.click();
    const firstVoice = page.getByRole('option').first();
    const selectedVoice = await firstVoice.innerText();
    await firstVoice.click();

    const speechOnlySwitch = dialog.getByRole('switch', {
      name: 'Antworten im Chat primär als Audio',
    });
    const expectedSpeechOnly = !(await speechOnlySwitch.isChecked());
    await speechOnlySwitch.setChecked(expectedSpeechOnly);

    await dialog.getByRole('button', { name: 'Schließen' }).click();
    const saveToast = page.getByText('Die Einstellungen wurden gespeichert.', { exact: true });
    await expect(saveToast).toBeVisible();
    await expect(saveToast).toBeHidden({ timeout: 10_000 });

    await page.getByRole('button', { name: 'profileDropdown' }).click();
    await page.getByRole('menuitem', { name: 'Einstellungen' }).click();

    const reopenedDialog = page.getByRole('dialog', { name: 'Einstellungen' });
    await expect(reopenedDialog).toBeVisible();
    await expect(
      reopenedDialog.getByRole('combobox', { name: 'Standardstimme der Sprachausgabe' }),
    ).toHaveText(selectedVoice);
    const reopenedSpeechOnlySwitch = reopenedDialog.getByRole('switch', {
      name: 'Antworten im Chat primär als Audio',
    });
    await expect(reopenedSpeechOnlySwitch).toHaveAttribute(
      'aria-checked',
      String(expectedSpeechOnly),
    );
  },
);
