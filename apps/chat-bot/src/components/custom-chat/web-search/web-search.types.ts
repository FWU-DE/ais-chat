import type { WebSearchScope } from '@shared/db/schema';

export type WebSearchFields = {
  isWebSearchEnabled: boolean;
  webSearchScope: WebSearchScope;
  webSearchIncludedDomains: string[];
};
