import exec from 'k6/execution';

import { SharedCharacterProxy } from './utils/shared-character-proxy';

/**
 * Load test for Shared Character API endpoints.
 *
 * This test focuses on the API endpoints only, without using the browser.
 * It simulates multiple users sending messages to a shared character concurrently.
 *
 * Before running this test, ensure that there is an existing character that can be shared.
 * The character will be shared during the setup phase and unshared during teardown.
 */
const existingCharacterId = __ENV.LOADTEST_CHARACTER_ID || 'd573e344-8119-46ca-bf9e-371800cf2782';
const loadTestVus = Number(__ENV.LOADTEST_VUS || 10);

export const options = {
  cloud: {
    distribution: {
      distributionLabel1: { loadZone: 'amazon:de:frankfurt', percent: 100 },
    },
  },
  scenarios: {
    api_calls_only: {
      // test if response times are acceptable with given request rate
      // executor: 'constant-arrival-rate',
      // startTime: '5s',
      // gracefulStop: '30s',
      // duration: '1m',
      // rate: 1, // Number of iterations to start during each timeUnit period
      // timeUnit: '1s', //Period of time to apply the rate value.
      // preAllocatedVus: 10,
      // maxVus: 50,

      executor: 'shared-iterations',
      startTime: '5s',
      gracefulStop: '30s',
      iterations: 120,
      vus: loadTestVus,
      maxDuration: '1m',
    },
  },
};

const sharedCharacterProxy = new SharedCharacterProxy();

type TestSetupParams = {
  characterId: string;
  inviteCode: string;
  userId: string;
};

export function setup(): TestSetupParams {
  try {
    console.log('running setup()...');

    // Share existing character
    const character = sharedCharacterProxy.getCharacter(existingCharacterId);
    const { inviteCode } = sharedCharacterProxy.shareCharacter({
      characterId: character.id,
      userId: character.userId,
      tokenPointsPercentageLimit: 100,
      usageTimeLimitMinutes: 60,
    });

    return { characterId: existingCharacterId, inviteCode, userId: character.userId };
  } catch (error) {
    console.error('Error in setup():', error);
    exec.test.abort('Setup failed');
    throw error;
  }
}

export function teardown(setupData: TestSetupParams) {
  try {
    console.log('running teardown()...');
    sharedCharacterProxy.unshareCharacter({
      characterId: setupData.characterId,
      userId: setupData.userId,
    });
  } catch (error) {
    console.error('Error in teardown():', error);
  }
}

const messages = [
  'Hallo, wer bist du?',
  'Was waren deine größten Erfindungen?',
  'Wie lange hast du gelebt?',
  'Wo bist du aufgewachsen?',
];

function getRandomMessage() {
  const index = Math.floor(Math.random() * messages.length);
  return messages[index] as string;
}

export default function main(setupData: TestSetupParams) {
  const { characterId, inviteCode } = setupData;
  sharedCharacterProxy.postChatMessage(characterId, inviteCode, getRandomMessage());
}
