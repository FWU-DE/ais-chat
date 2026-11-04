import type { AiActivityToolName } from '@/types/ai-activity';
import { expect, test } from '../../fixtures/test';
import { AUTH_FILES, MOCK_LLM_COMMANDS } from '../../utils/const';
import { expectAiActivityStep, sendMessage, uploadFile } from '../../utils/chat';

test.use({ storageState: AUTH_FILES.teacher });

const SAMPLE_FILE = 'Große Text Datei.txt';

// Minimal, schema-valid arguments per tool, plus a natural-language prompt a real LLM should also
// call the tool for. The mock LLM forces the tool call via the command; the activity step renders
// as soon as the call arrives, regardless of whether the real tool handler succeeds.
const TOOLS: Record<AiActivityToolName, { args: unknown; prompt: string }> = {
  web_search: {
    args: { query: 'Wetter in Augsburg' },
    prompt: 'Nutze die Websuche, um herauszufinden, wie das Wetter aktuell in Augsburg ist.',
  },
  web_scraper: {
    args: { urls: ['https://example.com'] },
    prompt: 'Rufe die Seite https://example.com auf und fasse ihren Inhalt zusammen.',
  },
  retrieve_text_chunks: {
    args: { search: 'Testdatei' },
    prompt: 'Durchsuche die hochgeladene Datei nach Informationen über die Hauptperson.',
  },
  retrieve_entire_file: {
    args: { fileName: SAMPLE_FILE },
    prompt: `Lies die gesamte Datei "${SAMPLE_FILE}" und fasse ihren Inhalt zusammen.`,
  },
  mundo_search: {
    args: { query: 'Photosynthese' },
    prompt: 'Suche in der MUNDO-Mediathek nach Unterrichtsmaterial zum Thema Photosynthese.',
  },
  math_calculate: {
    args: { expression: '2 + 2' },
    prompt: 'Berechne 2 + 2.',
  },
  create_plot: {
    args: { description: 'y = x' },
    prompt: 'Zeichne den Graphen der Funktion y = x.',
  },
};

// These tools look up an uploaded file in the conversation.
const TOOLS_REQUIRING_FILE: AiActivityToolName[] = ['retrieve_text_chunks', 'retrieve_entire_file'];

for (const [tool, { args, prompt }] of Object.entries(TOOLS) as [
  AiActivityToolName,
  { args: unknown; prompt: string },
][]) {
  test(`shows an AI activity step for ${tool}`, async ({ page }) => {
    await page.goto('/');

    if (TOOLS_REQUIRING_FILE.includes(tool)) {
      await uploadFile(page, `./e2e/fixtures/file-upload/${SAMPLE_FILE}`);
    }

    await sendMessage(page, `${MOCK_LLM_COMMANDS.CALL_TOOL(tool, args)} ${prompt}`);
    await expectAiActivityStep(page, tool, 1);
  });
}

test('shows no AI activity step for a call to an unknown tool', async ({ page }) => {
  await page.goto('/');

  await sendMessage(page, MOCK_LLM_COMMANDS.CALL_TOOL('not_a_real_tool', {}));
  await expect(page.getByTestId('ai-activity-toggle-1')).toHaveCount(0);
});
