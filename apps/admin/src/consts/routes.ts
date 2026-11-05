import { TemplateTypes } from '@shared/templates/template';

export const ROUTES = {
  home: '/',
  api: {
    apiKeyDetails: (projectId: string, apiKeyId: string) =>
      `/projects/${projectId}/api-keys/${apiKeyId}`,
    apiKeyNew: (projectId: string) => `/projects/${projectId}/api-keys/new`,
    apiKeyModelMappings: (projectId: string, apiKeyId: string) =>
      `/projects/${projectId}/api-keys/${apiKeyId}/model-mappings`,
    llms: '/llms',
    llmDetails: (llmId: string) => `/llms/${llmId}`,
    llmNew: '/llms/new',
    providerKeys: '/provider-keys',
    providerKeyDetails: (providerKeyId: string) => `/provider-keys/${providerKeyId}`,
    providerKeyNew: '/provider-keys/new',
    projects: '/projects',
    projectDetails: (projectId: string) => `/projects/${projectId}`,
  },
  app: {
    apiKey: (federalStateId: string) => `/ais-chat-app/federal-states/${federalStateId}/api-key`,
    page: '/ais-chat-app',
    federalStates: `/ais-chat-app/federal-states`,
    federalStateDetails: (federalStateId: string) =>
      `/ais-chat-app/federal-states/${federalStateId}`,
    infoBanners: '/ais-chat-app/info-banners',
    infoBannerNew: '/ais-chat-app/info-banners/new',
    infoBannerDetails: (infoBannerId: string) => `/ais-chat-app/info-banners/${infoBannerId}`,
    toolCallCosts: '/ais-chat-app/tool-call-costs',
    staticModels: '/ais-chat-app/static-models',
    templates: '/ais-chat-app/templates',
    template: (templateType: TemplateTypes, templateId: string) =>
      `/ais-chat-app/templates/${templateType}/${templateId}`,
    communityTemplates: '/ais-chat-app/community-templates',
    communityTemplateRequest: (requestId: string) =>
      `/ais-chat-app/community-templates/${requestId}`,
    vouchers: (federalStateId: string) => `/ais-chat-app/federal-states/${federalStateId}/vouchers`,
    voucherNew: (federalStateId: string) =>
      `/ais-chat-app/federal-states/${federalStateId}/vouchers/new`,
    suspensions: '/ais-chat-app/suspensions',
    suspensionDetails: (entityType: string, entityId: string) =>
      `/ais-chat-app/suspensions/${entityType}/${entityId}`,
    urlPresets: '/ais-chat-app/url-presets',
  },
};
