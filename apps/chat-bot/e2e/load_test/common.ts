import { check } from 'k6';
import { browser, BrowserContext, Page } from 'k6/browser';

import { BASE_URL, LLM_MODELS, SCREENSHOT_FOLDERS, SELECTORS, WAIT_TIMES_IN_MS } from './config';

export async function saveScreenshot(page: Page, userIndex: string, isSuccess: boolean) {
  try {
    const folder = isSuccess
      ? SCREENSHOT_FOLDERS.SUCCESS_RESULTS
      : SCREENSHOT_FOLDERS.ERROR_RESULTS;
    const prefix = isSuccess ? 'success' : 'error';
    const screenshotPath = `${folder}/${prefix}-${userIndex}.png`;

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
  } catch (screenshotError) {
    console.error(`Failed to save screenshot for user ${userIndex}:`, screenshotError);
    // Don't throw here - we don't want screenshot failures to break the test
  }
}

function tagHttpRequests(page: Page) {
  page.on('metric', (metric) => {
    metric.tag({
      name: `${BASE_URL}/d/[conversationId]`,
      matches: [{ url: new RegExp(`^${BASE_URL}/d/[a-zA-Z0-9-]+($|\\?)`) }],
    });
    metric.tag({
      name: `${BASE_URL}/characters/d/[characterId]/[conversationId]`,
      matches: [
        { url: new RegExp(`^${BASE_URL}/characters/d/[a-zA-Z0-9-]+/[a-zA-Z0-9-]+($|\\?)`) },
      ],
    });
    metric.tag({
      name: `${BASE_URL}/assistants/d/[gptId]`,
      matches: [{ url: new RegExp(`^${BASE_URL}/assistants/d/[a-zA-Z0-9-]+($|\\?)`) }],
    });
    metric.tag({
      name: `${BASE_URL}/assistants/d/[gptId]/[conversationId]`,
      matches: [
        { url: new RegExp(`^${BASE_URL}/assistants/d/[a-zA-Z0-9-]+/[a-zA-Z0-9-]+($|\\?)`) },
      ],
    });
    metric.tag({
      name: `${BASE_URL}/_next/static/*`,
      matches: [{ url: new RegExp(`^${BASE_URL}/_next/static/.+`) }],
    });
    metric.tag({
      name: `${BASE_URL}/api/auth/callback/vidis*`,
      matches: [
        {
          url: new RegExp(`^${BASE_URL}/api/auth/callback/vidis`),
        },
      ],
    });
    metric.tag({
      name: `https://login.fwu.de/*`,
      matches: [{ url: /^https:\/\/login\.fwu\.de/ }],
    });
    metric.tag({
      name: `https://aai-test.vidis.schule/*`,
      matches: [{ url: /^https:\/\/aai-test\.vidis\.schule/ }],
    });
  });
}

export async function runTest(
  testFunction: (data: {
    context: BrowserContext;
    page: Page;
    userIndex: string;
    auth: { userName: string; password: string; idpHint?: string };
  }) => Promise<void>,
) {
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();
  tagHttpRequests(page);

  page.setDefaultTimeout(WAIT_TIMES_IN_MS.PAGE_ELEMENT_TIMEOUT);

  const userIndex = `${__VU}-${__ITER}-${Date.now()}`;
  const userName = __ENV.LOADTEST_USERNAME;
  const password = __ENV.LOADTEST_PASSWORD;
  const idpHint = __ENV.LOADTEST_IDP_HINT;

  if (!userName || !password) {
    throw new Error(
      'Please provide the username and password for the test user via the env variables LOADTEST_USERNAME and LOADTEST_PASSWORD',
    );
  }

  let testSuccessful = false;

  try {
    const auth = { userName, password, idpHint };
    await testFunction({ context, page, userIndex, auth });

    testSuccessful = true;
    console.log(`Test successful for user ${userIndex}`);
  } catch (error) {
    console.error(`Error during test execution for user ${userIndex}:`, error);
    throw error;
  } finally {
    await saveScreenshot(page, userIndex, testSuccessful);

    console.info({
      userIndex,
      testSuccessful,
      vu: __VU,
      iter: __ITER,
    });

    await page.close();
    await context.close();
  }
}

export async function performLogin(
  page: Page,
  { userName, password, idpHint }: { userName: string; password: string; idpHint?: string },
) {
  let successfulLogin = false;
  try {
    let url = `${BASE_URL}/login`;
    if (idpHint) url += `?vidis_idp_hint=${idpHint}`;
    await page.goto(url, {
      timeout: WAIT_TIMES_IN_MS.NAVIGATION_TIMEOUT,
    });

    if (!idpHint) {
      await page.getByTestId('vidis-login-button').click();
    }

    const usernameInput = page.getByLabel('Username');
    await usernameInput.waitFor();
    await usernameInput.fill(userName);

    const passwordInput = page.getByRole('textbox', { name: 'Password' });
    await passwordInput.waitFor();
    await passwordInput.fill(password);

    await page.keyboard.press('Enter');

    await page.waitForNavigation({ url: /\/?$/, timeout: WAIT_TIMES_IN_MS.NAVIGATION_TIMEOUT });
    await page
      .locator(SELECTORS.PROFILE_BUTTON)
      .waitFor({ timeout: WAIT_TIMES_IN_MS.NAVIGATION_TIMEOUT });
    successfulLogin = true;
  } finally {
    check(page, {
      'Login was successful': () => successfulLogin,
    });
  }
}

export async function selectModel(page: Page, userIndex: number) {
  let successfullySelected = false;
  try {
    const dropdownLocator = page.getByLabel('Select text Model Dropdown');
    await dropdownLocator.waitFor();

    const currentSelectedText = await dropdownLocator.textContent();
    const targetModel = LLM_MODELS.at(userIndex % LLM_MODELS.length);
    if (!targetModel) {
      throw new Error(
        `No target model found for computed index during load test model selection (userIndex=${userIndex}, LLM_MODELS.length=${LLM_MODELS.length})`,
      );
    }

    if (currentSelectedText?.includes(targetModel.displayName)) {
      successfullySelected = true;
      console.log(
        `Model ${targetModel.displayName} already selected for user ${userIndex}, skipping selection`,
      );
      return;
    }

    await dropdownLocator.click();
    await page.locator(SELECTORS.DROPDOWN_WRAPPER).waitFor();

    const modelLocator = page.getByLabel(`Select ${targetModel.id} Model`);
    await modelLocator.waitFor();

    const changeLlmNavigation = page.waitForURL(
      new RegExp(`model=${encodeURIComponent(targetModel.id)}\$`),
      {
        timeout: WAIT_TIMES_IN_MS.NAVIGATION_TIMEOUT,
      },
    );
    await modelLocator.click();
    await changeLlmNavigation;
    console.log(`Selected model ${targetModel.displayName} for user ${userIndex}`);
    successfullySelected = true;
  } finally {
    check(page, {
      'Model selected': () => successfullySelected,
    });
  }
}

export async function sendMessage(page: Page, prompt: string) {
  let content = '';
  try {
    const inputField = page.locator(SELECTORS.MESSAGE_INPUT);
    await inputField.waitFor();
    await inputField.fill(prompt);

    const sendButton = page.locator(SELECTORS.SEND_BUTTON);
    await sendButton.waitFor();
    await sendButton.click();

    const aiMessage = page.locator(SELECTORS.AI_MESSAGE);
    await aiMessage.waitFor({ timeout: WAIT_TIMES_IN_MS.AI_MESSAGE_TIMEOUT });

    await page
      .locator(SELECTORS.RELOAD_BUTTON)
      .waitFor({ timeout: WAIT_TIMES_IN_MS.AI_MESSAGE_TIMEOUT });
    content = (await aiMessage.textContent())?.trim() ?? '';
    console.log(`AI response received. Content length: ${content.length}`);
  } finally {
    check(page, {
      'AI response has expected content': () => content.length > 10,
    });
  }
}
