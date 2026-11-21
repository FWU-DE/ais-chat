import { nanoid } from 'nanoid';

import { expect, test } from '../../fixtures/test';
import { createCharacter, deleteCharacter } from '../../utils/character';
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacher });

test(
  'browser back from the character editor returns to the overview and keeps pending changes',
  { tag: '@smoke' },
  async ({ page }) => {
    const characterName = 'Back Button ' + nanoid(8);

    await createCharacter(page);
    await page.getByTestId('character-name-input').fill(characterName);

    await page.goBack();
    await expect(page).toHaveURL(/\/characters$/);

    await expect(page.getByText(characterName).first()).toBeVisible({ timeout: 15000 });

    await deleteCharacter(page, characterName);
  },
);
