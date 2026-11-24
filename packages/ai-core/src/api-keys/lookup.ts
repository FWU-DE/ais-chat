import { dbGetApiKeyById, dbLookupApiKeyByFullKey } from '@ais-chat/api-database';

export async function apiKeyExists(apiKeyId: string): Promise<boolean> {
  return (await dbGetApiKeyById({ apiKeyId })) !== undefined;
}

/**
 * Looks up API key IDs by federal state ID.
 *
 * Takes a mapping of federal state IDs to their decrypted API keys,
 * looks up each API key using dbLookupApiKeyByFullKey, and returns a mapping of
 * federal state IDs to their corresponding API key IDs (or null if not found).
 *
 * @param apiKeysByState - A record mapping federal state IDs to decrypted API keys
 * @returns A promise that resolves to a record mapping federal state IDs to API key IDs (or null if not found)
 */
export async function lookupApiKeys(apiKeysByState: Record<string, string>) {
  const result: Record<string, string | null> = {};

  for (const [federalStateId, decryptedApiKey] of Object.entries(apiKeysByState)) {
    const apiKey = await dbLookupApiKeyByFullKey(decryptedApiKey);

    if (apiKey && 'id' in apiKey) {
      result[federalStateId] = apiKey.id;
    } else {
      result[federalStateId] = null;
    }
  }

  return result;
}
