import { Locator, Page } from '@playwright/test';
import { nanoid } from 'nanoid';

import { expect, test } from '../fixtures/test';
import { configureAssistant, createAssistant, deleteAssistant } from '../utils/assistant';
import { configureCharacter, createCharacter, deleteCharacter } from '../utils/character';
import { AUTH_FILES } from '../utils/const';
import {
  configureLearningScenario,
  createLearningScenario,
  deleteLearningScenario,
} from '../utils/learning-scenario';

test.use({ storageState: AUTH_FILES.teacher });

type FavoriteTestEntity = {
  label: string;
  overviewPath: string;
  create: (page: Page) => Promise<void>;
  configure: (page: Page, data: { name: string }) => Promise<void>;
  remove: (page: Page, name: string) => Promise<void>;
};

const entities: FavoriteTestEntity[] = [
  {
    label: 'assistant',
    overviewPath: '/assistants',
    create: createAssistant,
    configure: configureAssistant,
    remove: deleteAssistant,
  },
  {
    label: 'character',
    overviewPath: '/characters',
    create: createCharacter,
    configure: configureCharacter,
    remove: deleteCharacter,
  },
  {
    label: 'learning scenario',
    overviewPath: '/learning-scenarios',
    create: createLearningScenario,
    configure: configureLearningScenario,
    remove: deleteLearningScenario,
  },
];

async function openOverviewTab(page: Page, overviewPath: string, tab: 'mine' | 'favorites') {
  await page.goto(overviewPath);
  await page.waitForURL(overviewPath);
  await page.getByTestId(`filter-tab-${tab}`).click();
}

function cardByName(page: Page, name: string) {
  return page.getByTestId('entity-card').filter({ hasText: name });
}

// The UI updates optimistically, so wait for the server action before navigating or reloading.
async function clickAndWaitForSave(page: Page, button: Locator) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.request().headers()['next-action'] !== undefined,
    ),
    button.click(),
  ]);
}

for (const entity of entities) {
  test.describe(`favorites of ${entity.label}`, () => {
    test(
      'can be set in the overview and the detail page and removed again',
      { tag: '@smoke' },
      async ({ page }) => {
        const name = `Favorit ${nanoid(8)}`;

        await entity.create(page);
        await entity.configure(page, { name });

        try {
          await openOverviewTab(page, entity.overviewPath, 'favorites');
          await expect(cardByName(page, name)).toHaveCount(0);

          await openOverviewTab(page, entity.overviewPath, 'mine');
          const card = cardByName(page, name).first();
          await expect(card).toBeVisible({ timeout: 15000 });
          const cardHeart = card.getByTestId('favorite-button');
          await expect(cardHeart).toHaveAttribute('aria-pressed', 'false');
          await clickAndWaitForSave(page, cardHeart);
          await expect(cardHeart).toHaveAttribute('aria-pressed', 'true');

          await openOverviewTab(page, entity.overviewPath, 'favorites');
          await expect(cardByName(page, name).first()).toBeVisible({ timeout: 15000 });

          await clickAndWaitForSave(
            page,
            cardByName(page, name).first().getByTestId('favorite-button'),
          );
          await expect(cardByName(page, name)).toHaveCount(0);

          await openOverviewTab(page, entity.overviewPath, 'mine');
          await cardByName(page, name).first().getByTestId('entity-link').click();
          const detailHeart = page.getByTestId('favorite-button');
          await expect(detailHeart).toHaveAttribute('aria-pressed', 'false');
          await clickAndWaitForSave(page, detailHeart);
          await expect(detailHeart).toHaveAttribute('aria-pressed', 'true');

          await page.reload();
          await expect(page.getByTestId('favorite-button')).toHaveAttribute('aria-pressed', 'true');

          await openOverviewTab(page, entity.overviewPath, 'favorites');
          await expect(cardByName(page, name).first()).toBeVisible({ timeout: 15000 });
        } finally {
          await openOverviewTab(page, entity.overviewPath, 'mine');
          await entity.remove(page, name);
        }
      },
    );
  });
}
