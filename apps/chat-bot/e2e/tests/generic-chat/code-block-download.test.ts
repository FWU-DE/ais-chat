import fs from 'node:fs';

import path from 'path';

import { expect, test } from '../../fixtures/test';
import { deleteChat, sendMessage } from '../../utils/chat';
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacher });

const CODE_MESSAGE = `
\`\`\`python title="hello.py"
print("Hallo")
\`\`\`

\`\`\`python title="Sortierfunktion"
print(sorted([2, 1]))
\`\`\`

\`\`\`text title="Dockerfile"
FROM node:24
\`\`\`

\`\`\`bash
echo "ohne Titel"
\`\`\`
`;

test(
  'downloads code blocks with the file name of the title or a generic name',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/');
    await sendMessage(page, CODE_MESSAGE);

    const assistantMessage = page.getByLabel('assistant message 1');
    const downloadButtons = assistantMessage.getByTestId('download-code');
    await expect(downloadButtons).toHaveCount(4);

    const expected = [
      ['hello.py', 'print("Hallo")'],
      ['Sortierfunktion.py', 'print(sorted([2, 1]))'],
      ['Dockerfile', 'FROM node:24'],
      ['code.sh', 'echo "ohne Titel"'],
    ];
    for (const [index, [fileName, content]] of expected.entries()) {
      const downloadPromise = page.waitForEvent('download');
      await downloadButtons.nth(index).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(fileName);
      expect(fs.readFileSync(await download.path(), 'utf8')).toBe(content);
    }

    await deleteChat(page, path.basename(page.url()));
  },
);
