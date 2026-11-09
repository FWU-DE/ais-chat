import { Page } from 'k6/browser';
import { Trend } from 'k6/metrics';

import { BASE_URL } from '../config';

const streamingResponseTime = new Trend('streaming_response_time', true);

export class SharedCharacterPage {
  constructor(
    private page: Page,
    private characterId: string,
    private inviteCode: string,
  ) {}

  async goto() {
    await this.page.goto(
      `${BASE_URL}/ua/characters/${this.characterId}/dialog?inviteCode=${this.inviteCode}`,
    );
    await this.page.waitForNavigation({ waitUntil: 'load' });
    console.log(`${__VU}-${__ITER} Navigated to shared character page`);
  }

  async sendMessage(message: string) {
    // write message into input field
    const chatInput = this.page.getByTestId('chat-input');
    await chatInput.waitFor();
    await chatInput.fill(message);

    // click send button and wait for response
    await this.page.getByTestId('submit-button').click();
    const startTime = Date.now();
    await this.page
      .getByTestId('streaming-finished')
      .waitFor({ state: 'attached', timeout: 30000 });
    streamingResponseTime.add(Date.now() - startTime);
  }
}
