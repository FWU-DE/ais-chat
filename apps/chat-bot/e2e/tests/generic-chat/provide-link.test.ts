import { expect, test } from '../../fixtures/test';
import { AUTH_FILES, MOCK_LLM_COMMANDS } from '../../utils/const';
import { sendMessage } from '../../utils/chat';

test.use({ storageState: AUTH_FILES.teacher });

test('teacher can provide link and it is displayed in the chat', async ({ page }) => {
  await page.goto('/');
  await sendMessage(
    page,
    `${MOCK_LLM_COMMANDS.CALL_WEB_SCRAPER}
    Wann hatte der Barock seinen Anfang?
    https://www.planet-wissen.de/geschichte/neuzeit/barock/index.html`,
  );

  await expect(page.getByTestId('citation').first()).toContainText('planet-wissen.de');
  await expect(page.getByLabel('assistant message 1')).toBeVisible();
  // The mock LLM calls the scraper tool, so the response contains the scraped page text.
  await expect(page.getByLabel('assistant message 1')).toContainText(/17.\sJahrhundert/);
});

test.describe('links in chat', () => {
  (
    [
      ['https://www.bravo.de/', 'bravo.de'],
      ['https://openmoji.org/library/', 'openmoji.org'],
    ] as const
  ).forEach(([link, host]) => {
    test(`provide link to complex website does not timeout (${link})`, async ({ page }) => {
      await page.goto('/');
      await sendMessage(
        page,
        `Fasse die Seite in genau einem Satz zusammen.

Wichtige Ausgabe-Regeln:
- Antworte nur mit genau einem Satz.
- Schreibe vor dem Satz exakt das Wort "START".

Seite: ${link}`,
      );

      await expect(page.getByTestId('citation').first()).toContainText(host);
      await expect(page.getByLabel('assistant message 1')).toBeVisible();
      await expect(page.getByLabel('assistant message 1')).toContainText('START');
    });
  });
});
