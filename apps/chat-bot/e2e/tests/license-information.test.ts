import type { Page } from '@playwright/test';
import { nanoid } from 'nanoid';
import { expect, test } from '../fixtures/test';
import { AUTH_FILES } from '../utils/const';
import { waitForAutosave } from '../utils/utils';
import { createAssistant, deleteAssistantFromDetailPage } from '../utils/assistant';
import { createCharacter, deleteCharacterFromDetailPage } from '../utils/character';
import {
  createLearningScenario,
  deleteLearningScenarioFromDetailPage,
} from '../utils/learning-scenario';

test.use({ storageState: AUTH_FILES.teacher });

const entities = [
  {
    label: 'assistant',
    basePath: '/assistants',
    create: createAssistant,
    deleteFromDetailPage: deleteAssistantFromDetailPage,
  },
  {
    label: 'character',
    basePath: '/characters',
    create: createCharacter,
    deleteFromDetailPage: deleteCharacterFromDetailPage,
  },
  {
    label: 'learning-scenario',
    basePath: '/learning-scenarios',
    create: createLearningScenario,
    deleteFromDetailPage: deleteLearningScenarioFromDetailPage,
  },
];

const COPYRIGHT_LINK_NAME = 'Übersicht zum Urheberrecht';

function getViewUrl(page: Page, basePath: string) {
  const entityId = page.url().split('/').pop()?.split('?')[0];
  return `${basePath}/${entityId}`;
}

for (const entity of entities) {
  test(`teacher can add license information to ${entity.label}`, async ({ page }) => {
    const licenseText = 'Bild von Max Mustermann, CC BY 4.0 ' + nanoid(8);

    await entity.create(page);

    const nameInput = page.getByTestId(`${entity.label}-name-input`);
    await nameInput.fill(`Lizenz ${nanoid(8)}`);
    await nameInput.press('Tab');
    await waitForAutosave(page);

    const toggle = page.getByTestId('license-information-toggle');
    const input = page.getByTestId('license-information-input');
    const copyrightLink = page.getByRole('link', { name: COPYRIGHT_LINK_NAME });

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
    await expect(input).toHaveValue(licenseText);

    await page.goto(getViewUrl(page, entity.basePath));
    await expect(page.getByText(licenseText)).toBeVisible();

    await page.goBack();
    await entity.deleteFromDetailPage(page);
  });

  test(`${entity.label} view hides license information when empty`, async ({ page }) => {
    await entity.create(page);

    const nameInput = page.getByTestId(`${entity.label}-name-input`);
    await nameInput.fill(`Ohne Lizenz ${nanoid(8)}`);
    await nameInput.press('Tab');
    await waitForAutosave(page);

    await page.goto(getViewUrl(page, entity.basePath));
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText('Lizenzinformationen')).toBeHidden();

    await page.goBack();
    await entity.deleteFromDetailPage(page);
  });
}
