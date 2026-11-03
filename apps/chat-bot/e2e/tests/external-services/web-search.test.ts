import { test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { expectAiActivityStep, expectNoAiActivityStep, sendMessage } from '../../utils/chat';

test.use({ storageState: AUTH_FILES.teacher });

test(
  'should successfully perform web search',
  {
    tag: '@external-services',
  },
  async ({ page }) => {
    await page.goto('/');

    // send a message that does not require web search
    await sendMessage(page, 'Hallo');
    await expectNoAiActivityStep(page, 'web_search', 1);

    // send a message that requires web search
    await sendMessage(page, 'Wie ist aktuell das Wetter in Augsburg?');
    await expectAiActivityStep(page, 'web_search', 2);
  },
);
