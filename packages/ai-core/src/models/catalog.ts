// Read-only access to the API-owned model catalog for apps outside the API.
export {
  type CatalogModel,
  dbGetAllCatalogModels as getAllCatalogModels,
  dbGetCatalogModelById as getCatalogModelById,
  dbGetCatalogModelByName as getCatalogModelByName,
  dbGetCatalogModelsByApiKeyId as getCatalogModelsByApiKeyId,
} from '@ais-chat/api-database';
