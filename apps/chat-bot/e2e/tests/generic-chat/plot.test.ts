import { expect, test } from '@playwright/test';
import { AUTH_FILES } from '../../utils/const';
import { deleteChat, sendMessage } from '../../utils/chat';
import path from 'path';

test.use({ storageState: AUTH_FILES.teacher });

const PLOT_MESSAGE =
  '```jsxgraph-json title="Sine wave"\n{"board":{"boundingBox":[-7,4,7,-4]},"elements":[["slider",[0,1,3],{"name":"a"}],["functiongraph",["a*sin(x)"]]]}\n```';

const INVALID_PLOT_MESSAGE = '```jsxgraph-json title="Broken"\n{"elements":\n```';

test('renders a valid plot with a slider', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, PLOT_MESSAGE);

  const assistantMessage = page.getByLabel('assistant message 1');
  await expect(assistantMessage).toBeVisible();

  const plot = assistantMessage.getByTestId('plot-view');
  await expect(plot).toBeVisible();
  await expect(plot).toHaveAttribute('aria-label', 'Sine wave');
  await expect(plot.locator('svg')).toBeVisible();
  await expect(assistantMessage.getByText('{"board"')).toHaveCount(0);

  await expect(assistantMessage.getByTestId('plot-slider-0')).toBeVisible();

  await deleteChat(page, path.basename(page.url()));
});

test('shows an error instead of crashing for an invalid plot', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, INVALID_PLOT_MESSAGE);

  const assistantMessage = page.getByLabel('assistant message 1');
  await expect(assistantMessage).toBeVisible();
  await expect(assistantMessage.getByTestId('plot-error')).toBeVisible();

  await deleteChat(page, path.basename(page.url()));
});

test('can toggle fullscreen, change the slider, reset and download the plot', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, PLOT_MESSAGE);

  const assistantMessage = page.getByLabel('assistant message 1');
  const fullscreenToggle = assistantMessage.getByTestId('plot-fullscreen-toggle');
  await fullscreenToggle.click();
  await expect(fullscreenToggle).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(fullscreenToggle).toHaveAttribute('aria-pressed', 'false');

  const slider = assistantMessage.getByTestId('plot-slider-0');
  await slider.fill('2');
  await expect(slider).toHaveValue('2');

  await assistantMessage.getByTestId('plot-reset').click();
  await expect(slider).toHaveValue('1');

  const downloadPromise = page.waitForEvent('download');
  await assistantMessage.getByTestId('plot-download-png').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('graph.png');

  await deleteChat(page, path.basename(page.url()));
});

test('copies a short description instead of the plot JSON to the clipboard', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, PLOT_MESSAGE);

  const assistantMessage = page.getByLabel('assistant message 1');
  await expect(assistantMessage).toBeVisible();

  await page.getByTestId('copy-to-clipboard').click();
  const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardContent).toBe('Grafik: Sine wave');

  await deleteChat(page, path.basename(page.url()));
});
