import { performLogin, runTest, selectModel, sendMessage } from './common';
import { HEADLESS_BROWSER_OPTIONS } from './config';

export const options = HEADLESS_BROWSER_OPTIONS;

const PROMPT = `Ich bin eine Lehrerin an einer Schule und unterrichte ein technisches Fach. 
Wie kann ich dennoch dazu beitragen, den Schülerinnen und Schülern soziale Werte zu vermitteln? Bitte schreib mir dazu 2-5 Sätze.`;

export default async function main() {
  await runTest(async ({ page, auth }) => {
    await performLogin(page, auth);
    await selectModel(page, Number(__VU) + Number(__ITER));
    await sendMessage(page, PROMPT);
  });
}
