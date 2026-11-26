import { expect, type Page, test } from '@playwright/test';
import { AUTH_FILES } from '../../utils/const';

test.use({
  storageState: AUTH_FILES.teacher,
  video: 'on',
});

async function selectFluxModel(page: Page) {
  const dropdown = page.getByLabel('Select image Model Dropdown');
  await dropdown.waitFor();
  const text = await dropdown.textContent();
  if (!text?.includes('FLUX')) {
    await dropdown.click();
    await page.locator('div[data-radix-popper-content-wrapper]').waitFor();
    await page.getByLabel(/flux/i).click();
  }
}

async function openAssistantAndWaitForFirstMessage(page: Page, buttonName: string) {
  await page.getByRole('button', { name: buttonName }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  // opening message is rendered synchronously — wait for it to appear
  await expect(sheet.locator('.bg-muted').first()).toBeVisible({ timeout: 5000 });
  return sheet;
}

// ── Test 1: fresh conversation, no pre-prompt ──────────────────────────────

test('image assistant - starts fresh conversation without pre-prompt', async ({ page }) => {
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  // Input box must be empty
  const promptInput = page.getByPlaceholder('Beschreibe, wie das Bild aussehen soll.');
  await expect(promptInput).toHaveValue('');

  const sheet = await openAssistantAndWaitForFirstMessage(page, 'Prompt-Assistent');

  await expect(sheet.getByRole('heading', { name: 'Bildassistent' })).toBeVisible();

  // Opening question is shown immediately (no LLM call on open)
  const firstBubble = sheet.locator('.bg-muted').first();
  await expect(firstBubble).toBeVisible();
  await expect(firstBubble).not.toBeEmpty();

  // No FINAL_PROMPT yet — "Prompt verwenden" button must not be visible
  const usePromptButton = sheet.getByRole('button', { name: /Prompt verwenden/i });
  await expect(usePromptButton).not.toBeVisible();
});

// ── Test 2: assistant with existing input prompt ───────────────────────────

test('image assistant - asks to reuse existing input text', async ({ page }) => {
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  // Pre-fill the input box with a partial prompt
  const promptInput = page.getByPlaceholder('Beschreibe, wie das Bild aussehen soll.');
  await promptInput.fill('Ein roter Drache in den Bergen');

  const sheet = await openAssistantAndWaitForFirstMessage(page, 'Prompt-Assistent');

  // Opening message immediately shows Ja/Nein chips for the existing text
  const chips = sheet.locator('button.rounded-full');
  await expect(chips.first()).toBeVisible({ timeout: 5000 });

  // Expect at least the two options: "Ja" and "Nein"
  expect(await chips.count()).toBeGreaterThanOrEqual(2);

  // Click the "Ja" chip to use the existing prompt
  const yesChip = chips.filter({ hasText: /ja/i }).first();
  await expect(yesChip).toBeVisible();
  await yesChip.click();

  // Wait for assistant to respond with a follow-up question
  await expect
    .poll(() => sheet.locator('.bg-muted').count(), { timeout: 30000 })
    .toBeGreaterThanOrEqual(2);
});

// ── Test 3: clicking "Nein" chip starts fresh without the existing prompt ──

test('image assistant - clicking "Nein" chip starts fresh conversation', async ({ page }) => {
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  // Pre-fill with an existing prompt
  const promptInput = page.getByPlaceholder('Beschreibe, wie das Bild aussehen soll.');
  await promptInput.fill('Ein blauer Elefant im Weltraum');

  const sheet = await openAssistantAndWaitForFirstMessage(page, 'Prompt-Assistent');

  // Ja/Nein chips should be visible
  const chips = sheet.locator('button.rounded-full');
  await expect(chips.first()).toBeVisible({ timeout: 5000 });

  // Click "Nein" to start fresh
  const noChip = chips.filter({ hasText: /nein/i }).first();
  await expect(noChip).toBeVisible();
  await noChip.click();

  // Wait for the assistant to respond with a fresh opening question
  await expect
    .poll(() => sheet.locator('.bg-muted').count(), { timeout: 30000 })
    .toBeGreaterThanOrEqual(2);

  // The original Ja/Nein chips are no longer on the last message (a new message is now last)
  const neinChipAfter = sheet.locator('button.rounded-full').filter({ hasText: /nein.*beginnen/i });
  await expect(neinChipAfter).toHaveCount(0);
});

// ── Test 4: edit assistant after image generation ──────────────────────────

test('edit assistant - opens and starts conversation after image generation', async ({ page }) => {
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  await selectFluxModel(page);

  // Generate an image first
  const prompt = 'A simple blue circle on white background';
  await page.getByPlaceholder('Beschreibe, wie das Bild aussehen soll.').fill(prompt);
  await page.getByRole('button', { name: 'Bild generieren' }).click();

  // Wait for the generated image to appear
  const generatedImage = page.getByRole('img', { name: prompt });
  await expect(generatedImage).toBeVisible({ timeout: 60000 });

  // Open the edit assistant
  const sheet = await openAssistantAndWaitForFirstMessage(page, 'Bild anpassen');

  await expect(sheet.getByRole('heading', { name: 'Bild anpassen' })).toBeVisible();

  // Opening question is shown immediately (no LLM call on open)
  const firstBubble = sheet.locator('.bg-muted').first();
  await expect(firstBubble).toBeVisible();
  await expect(firstBubble).not.toBeEmpty();

  // Simulate user input asking for a color change
  const input = sheet.getByPlaceholder('Antwort...');
  await input.fill('Mach den Kreis grün statt blau');
  await sheet.getByRole('button', { name: 'Senden' }).click();

  // Wait for the assistant to respond again
  await expect
    .poll(() => sheet.locator('.bg-muted').count(), { timeout: 30000 })
    .toBeGreaterThanOrEqual(2);
});
