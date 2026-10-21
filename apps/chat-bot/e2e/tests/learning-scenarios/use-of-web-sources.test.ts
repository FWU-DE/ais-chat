import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { sendMessage } from '../../utils/chat';
import { configureLearningScenario } from '../../utils/learning-scenario';
import { waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';

test.use({ storageState: AUTH_FILES.teacher });

const data = {
  additionalInstructions:
    'Der Chatbot soll aus der Perspektive eines neutralen Vermittlers im Nahostkonflikt antworten und verschiedene Sichtweisen beleuchten.',
  description: 'Konfliktanalyse und Lösungsansätze im Nahostkonflikt',
  gradeLevel: '11. Klasse',
  name: 'Analyse des Nahostkonflikts – Gruppe 1 Vermittler ' + nanoid(8),
  schoolType: 'Gymnasium',
  studentExercise:
    'Schüler sollen die Ursachen, den Verlauf und mögliche Lösungsansätze des Nahostkonflikts analysieren.',
  subject: 'Politik',
};

test('teacher can create shared chat with web sources, student can join chat and reference web sources', async ({
  page,
}) => {
  await page.goto('/learning-scenarios');
  await page.waitForURL('/learning-scenarios');
  await page.getByRole('button', { name: 'Lernszenario erstellen' }).click();
  await page.waitForURL('/learning-scenarios/**');

  // configure form
  await configureLearningScenario(page, data);
  await page
    .getByRole('textbox', { name: 'URL eingeben' })
    .fill(
      'https://www.dw.com/de/trump-im-israel-iran-konflikt-kurs-ohne-klare-linie-donald-trump-benjamin-netanjahu-atomwaffen-v2/a-72936043',
    );
  await page.getByRole('button', { name: 'Webseite hinzufügen' }).click();

  // Still on the editor page after autosave
  await waitForAutosave(page);
  const stopSharingButton = page.getByRole('button', { name: 'Stop' });
  if (await stopSharingButton.isVisible()) {
    await stopSharingButton.click();
  }
  await page.getByTestId('token-points-select').click();
  await page.getByTestId('token-points-option-50').click();
  await page.getByTestId('usage-time-select').click();
  await page.getByTestId('usage-time-option-30').click();
  await page.getByTestId('start-share-button').click();

  // enter chat directly as a teacher
  const schoolChatPagePromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Chat öffnen' }).click();
  const schoolChatPage = await schoolChatPagePromise;
  await schoolChatPage.getByLabel('profileDropdown').waitFor();

  // send first message
  const button = schoolChatPage.getByTestId('start-dialog-button');
  await button.waitFor();
  await button.click();
  await sendMessage(
    schoolChatPage,
    'Was berichtete der Reporter Bret Baier nach einem Gespräch mit US-Präsident Trump? Beende die Antwort mit "ENDE".',
  );

  await expect(schoolChatPage.getByLabel('assistant message 1')).toContainText('ENDE');
});
