import { dbGetApiKeyById } from '@ais-chat/api-database';

export async function apiKeyExists(apiKeyId: string): Promise<boolean> {
  return (await dbGetApiKeyById({ apiKeyId })) !== undefined;
}
