import { db } from '..';
import { decrypt, encrypt } from '../crypto';
import { FederalStateInsertModel, federalStateTable } from '../schema';
import { dbGetFederalStateWithDecryptedApiKey } from '../functions/federal-state';
import { dbUpdateLlmModelsForAllFederalStates } from '../functions/llm-model';
import { env } from '../../env';
import { env as aiEnv } from '@ais-chat/ai-core/env';
import { lookupApiKeys } from '@ais-chat/ai-core/api-keys/lookup';

export async function insertFederalStates({ skip = true }: { skip: boolean }) {
  if (skip) return;
  if (FEDERAL_STATES.length === 0) {
    const envVariables = FEDERAL_STATE_DEFINITIONS.map((f) => f.envKeyName);
    throw new Error(
      `Failed to insert Federal States, configure at least one of the following env variables: ${envVariables.join(', ')}`,
    );
  }

  const apiKeysByState: Record<string, string> = {};
  let apiKeyIdsByState: Record<string, string | null> = {};

  if (aiEnv.apiDatabaseUrl) {
    // Decrypt API keys and lookup their IDs
    for (const federalState of FEDERAL_STATES) {
      apiKeysByState[federalState.id] = decrypt({
        data: federalState.encryptedApiKey,
        plainEncryptionKey: env.encryptionKey,
      });
    }

    apiKeyIdsByState = await lookupApiKeys(apiKeysByState);
  }

  for (const federalState of FEDERAL_STATES) {
    const apiKeyId = apiKeyIdsByState[federalState.id];
    await db
      .insert(federalStateTable)
      .values({ ...federalState, apiKeyId })
      .onConflictDoUpdate({
        target: federalStateTable.id,
        set: {
          encryptedApiKey: federalState.encryptedApiKey,
          apiKeyId,
        },
      });

    // upsert models per federal state
    const federalStateAndApiKey = await dbGetFederalStateWithDecryptedApiKey({
      federalStateId: federalState.id,
    });
    if (federalStateAndApiKey === undefined) {
      return;
    }
  }

  await dbUpdateLlmModelsForAllFederalStates();

  console.log('federalState seed successful');
}

const FEDERAL_STATE_DEFINITIONS = [
  {
    id: 'DE-BW',
    name: 'Baden-Württemberg',
    envKeyName: 'DE_BW_API_KEY',
  },
  {
    id: 'DE-BY',
    name: 'Bayern (Freistaat)',
    envKeyName: 'DE_BY_API_KEY',
  },
  {
    id: 'DE-BE',
    name: 'Berlin',
    envKeyName: 'DE_BE_API_KEY',
  },
  {
    id: 'DE-BB',
    name: 'Brandenburg',
    envKeyName: 'DE_BB_API_KEY',
  },
  {
    id: 'DE-HB',
    name: 'Bremen (Hansestadt)',
    envKeyName: 'DE_HB_API_KEY',
  },
  {
    id: 'DE-HH',
    name: 'Hamburg (Hansestadt)',
    envKeyName: 'DE_HH_API_KEY',
  },
  {
    id: 'DE-HE',
    name: 'Hessen',
    envKeyName: 'DE_HE_API_KEY',
  },
  {
    id: 'DE-MV',
    name: 'Mecklenburg-Vorpommern',
    envKeyName: 'DE_MV_API_KEY',
  },
  {
    id: 'DE-NI',
    name: 'Niedersachsen',
    envKeyName: 'DE_NI_API_KEY',
  },
  {
    id: 'DE-NW',
    name: 'Nordrhein-Westfalen',
    envKeyName: 'DE_NW_API_KEY',
  },
  {
    id: 'DE-RP',
    name: 'Rheinland-Pfalz',
    envKeyName: 'DE_RP_API_KEY',
  },
  {
    id: 'DE-SL',
    name: 'Saarland',
    envKeyName: 'DE_SL_API_KEY',
  },
  {
    id: 'DE-SN',
    name: 'Sachsen (Freistaat)',
    envKeyName: 'DE_SN_API_KEY',
  },
  {
    id: 'DE-ST',
    name: 'Sachsen-Anhalt',
    envKeyName: 'DE_ST_API_KEY',
  },
  {
    id: 'DE-SH',
    name: 'Schleswig-Holstein',
    envKeyName: 'DE_SH_API_KEY',
  },
  {
    id: 'DE-TH',
    name: 'Thüringen (Freistaat)',
    envKeyName: 'DE_TH_API_KEY',
  },
  {
    id: 'DE-TEST',
    name: 'Testbundesland',
    envKeyName: 'DE_TEST_API_KEY',
  },
  {
    id: 'DE-FWU',
    name: 'FWU',
    envKeyName: 'DE_FWU_API_KEY',
  },
];

// Generate federal states dynamically based on available API keys in environment
export const FEDERAL_STATES = FEDERAL_STATE_DEFINITIONS.filter((state) => {
  const apiKey = process.env[state.envKeyName];
  return apiKey && apiKey.trim() !== '';
}).map((state) => ({
  id: state.id,
  studentPriceLimit: 200,
  teacherPriceLimit: 500,
  encryptedApiKey: encrypt({
    plainEncryptionKey: env.encryptionKey,
    text: process.env[state.envKeyName]!,
  }),
  featureToggles: {
    isStudentAccessEnabled: true,
    isCharacterEnabled: true,
    isCustomGptEnabled: true,
    isSharedChatEnabled: true,
    isShareTemplateWithSchoolEnabled: true,
    isSharedPageLocaleDetectionEnabled: true,
    isImageGenerationEnabled: true,
    isWebSearchEnabled: true,
  },
})) satisfies Array<Omit<FederalStateInsertModel, 'organizationId'>>;
