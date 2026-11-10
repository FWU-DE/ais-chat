import { check } from 'k6';
import { Page } from 'k6/browser';
import encoding from 'k6/encoding';

import { performLogin, runTest, selectModel, sendMessage } from './common';
import { HEADLESS_BROWSER_OPTIONS, WAIT_TIMES_IN_MS } from './config';

export const options = HEADLESS_BROWSER_OPTIONS;

const PROMPT = `Was sind große Meilensteine im Leben von Van Gogh? Bitte schreib mir dazu 2-5 Sätze.`;

const FILE_CONTENT = `Vincent van Gogh wurde 1853 in Zundert geboren und nahm 1881 bei seinen Eltern die Malerei auf, finanziell und emotional unterstützt von seinem Bruder Theo.
1886 zog er nach Paris und traf Avantgarde-Künstlerinnen und -Künstler wie Émile Bernard und Paul Gauguin.
1888 folgte die prägende Arles-Zeit mit helleren Farben und Naturmotiven; nach dem Konflikt mit Gauguin verletzte er sich am linken Ohr und verbrachte Zeit in psychiatrischen Kliniken, darunter Saint-Rémy.
1890 lebte er in Auvers-sur-Oise unter Dr. Paul Gachet und starb am 29. Juli 1890; seine große Anerkennung setzte vor allem posthum ein.`;

export default async function main() {
  await runTest(async ({ page, userIndex, auth }) => {
    await performLogin(page, auth);
    await selectModel(page, Number(__VU) + Number(__ITER));
    await uploadPdfFile(page, userIndex);
    await sendMessage(page, PROMPT);
  });
}

// File upload does not work on k6 cloud, the client unexpectedly closes the connection before the file is fully uploaded
async function uploadPdfFile(page: Page, userIndex: string) {
  let successfulUpload = false;
  try {
    const uploadPromise = page.waitForResponse(/.*\/api\/v1\/files$/, {
      timeout: WAIT_TIMES_IN_MS.FILE_UPLOAD_TIMEOUT,
    });
    await page.setInputFiles(
      'input[type="file"]',
      {
        // @ts-expect-error Typings from @types/k6 are incorrect, string is allowed
        buffer: encoding.b64encode(FILE_CONTENT),
        mimeType: 'text/plain',
        name: `${userIndex}.txt`,
      },
      {
        timeout: WAIT_TIMES_IN_MS.FILE_UPLOAD_TIMEOUT,
      },
    );

    await uploadPromise;
    successfulUpload = true;
  } finally {
    check(page, {
      'File uploaded successfully': () => successfulUpload,
    });
  }
}
