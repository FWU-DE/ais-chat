// Read-only access to the API-owned llm models (without sensitive fields) for apps outside the API.
export {
  dbGetAllLlmModels as getAllLlmModels,
  dbGetLlmModelById as getLlmModelById,
  dbGetLlmModelByName as getLlmModelByName,
  dbGetLlmModelsByApiKeyId as getLlmModelsByApiKeyId,
  type LlmModel,
} from '@ais-chat/api-database';
