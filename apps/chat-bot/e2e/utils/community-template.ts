import { expect, Page } from '@playwright/test';

/**
 * Helpers for the community template workflow, shared between the chat-bot
 * (author) and admin (editor) perspectives.
 *
 * Controls are referenced via `data-testid` wherever possible.
 */

const CONFIRMATION_CHECKBOX_SELECTOR = '[data-testid^="community-confirmation-items-"]';

/**
 * Submits the currently open character/assistant/learning-scenario to the
 * community: checks the community sharing checkbox, accepts the confirmation
 * checklist and waits for the request card to show the "submitted" state.
 */
export async function submitToCommunity(page: Page): Promise<void> {
  await page.getByTestId('community-sharing-checkbox').click();

  await expect(page.getByTestId('community-confirmation-accept')).toBeVisible();

  const checkboxes = await page.locator(CONFIRMATION_CHECKBOX_SELECTOR).all();
  for (const checkbox of checkboxes) {
    await checkbox.click();
  }

  await page.getByTestId('community-confirmation-accept').click();

  await expectRequestStatus(page, 'Eingereicht');
}

/**
 * Ensures the collapsible community request card is expanded so its actions
 * (resubmit, message editor) are interactable.
 */
async function expandRequestCard(page: Page): Promise<void> {
  const messageButton = page.getByTestId('community-template-request-message-editor');
  if (await messageButton.isVisible()) {
    return;
  }
  await page.getByTestId('community-template-request-toggle').click();
  await expect(messageButton).toBeVisible();
}

/**
 * Sends a message to the editorial team from the community request card.
 */
export async function sendMessageToEditor(page: Page, message: string): Promise<void> {
  await expandRequestCard(page);
  await page.getByTestId('community-template-request-message-editor').click();

  const input = page.getByTestId('community-template-message-input');
  await expect(input).toBeVisible();
  await input.fill(message);

  await page.getByTestId('community-template-message-send').click();
  await expect(input).toBeHidden();
}

/**
 * Resubmits a previously rejected community request.
 *
 * The editor page does heavy client-side work right after a fresh navigation
 * (the request is already expanded on mount when rejected, so there is no prior
 * click to naturally wait out that work). The initial click can land while the
 * main thread is still busy and never reach the handler, so retry the click
 * until the status actually flips instead of guessing a fixed delay.
 */
export async function resubmitRequest(page: Page): Promise<void> {
  await expandRequestCard(page);
  const resubmitButton = page.getByTestId('community-template-request-resubmit');
  const status = page.getByTestId('community-template-request-status');

  await expect(async () => {
    await resubmitButton.click();
    await expect(status).toHaveText('Eingereicht', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

/**
 * Asserts the status chip of the author-side community request card.
 */
export async function expectRequestStatus(page: Page, label: string): Promise<void> {
  await expect(page.getByTestId('community-template-request-status')).toHaveText(label);
}

/**
 * Asserts the community request card is no longer rendered (e.g. after approval).
 */
export async function expectNoRequestCard(page: Page): Promise<void> {
  await expect(page.getByTestId('community-template-request')).toHaveCount(0);
}

/**
 * Opens the admin community template request detail view for the given entity
 * name by filtering the list and clicking the resulting row.
 */
export async function openRequestInAdmin(adminPage: Page, entityName: string): Promise<void> {
  await adminPage.goto('/ais-chat-app/community-templates');

  // list data loads client-side after mount; wait for it before filtering
  await expect(adminPage.getByTestId('data-table-row').first()).toBeVisible();

  await adminPage.getByTestId('community-template-name-filter').fill(entityName);

  const row = adminPage.getByTestId('data-table-row');
  await expect(row).toHaveCount(1);
  await row.click();

  await adminPage.waitForURL('**/ais-chat-app/community-templates/**');
}

/**
 * Rejects the currently open admin request with a custom message.
 */
export async function rejectRequestInAdmin(adminPage: Page, message: string): Promise<void> {
  await adminPage.getByTestId('community-template-reject-button').click();

  const input = adminPage.getByTestId('community-template-reject-message-input');
  await expect(input).toBeVisible();
  await input.fill(message);

  await adminPage.getByTestId('community-template-reject-confirm').click();
  await expectAdminState(adminPage, 'Überarbeitung angefordert');
}

/**
 * Approves the currently open admin request.
 */
export async function approveRequestInAdmin(adminPage: Page): Promise<void> {
  await adminPage.getByTestId('community-template-approve-button').click();
  await expectAdminState(adminPage, 'Genehmigt');
}

/**
 * Asserts the status value shown in the admin request detail view.
 */
export async function expectAdminState(adminPage: Page, label: string): Promise<void> {
  await expect(adminPage.getByTestId('community-template-state')).toHaveText(label);
}
