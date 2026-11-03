import { test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import {
  expectAiActivityStep,
  expectNoAiActivityStep,
  selectDifferentModel,
  sendMessage,
} from '../../utils/chat';
import { LLM_MODELS } from '../../utils/llm-models';

test.use({ storageState: AUTH_FILES.teacher });

test(
  'should successfully perform web search',
  {
    tag: '@external-services',
  },
  async ({ page }) => {
    await page.goto('/');
    await selectDifferentModel(page, LLM_MODELS.REAL_MODEL);

    // send a message that does not require web search
    await sendMessage(page, 'Hallo');
    await expectNoAiActivityStep(page, 'web_search', 1);

    // send a message that requires web search
    await sendMessage(
      page,
      'Nutze die Websuche, um herauszufinden, wie das Wetter aktuell in Augsburg ist.',
    );
    await expectAiActivityStep(page, 'web_search', 2);
  },
);
