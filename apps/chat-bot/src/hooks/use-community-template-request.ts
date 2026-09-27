'use client';

import { useEffect, useState } from 'react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';

type CommunityTemplateRequestActionResult =
  ServerActionResult<CommunityTemplateRequestWithEvents | null>;

type UseCommunityTemplateRequestOptions = {
  entityId: string;
  getRequest: () => Promise<CommunityTemplateRequestActionResult>;
  createRequest: () => Promise<CommunityTemplateRequestActionResult>;
  cancelRequest: () => Promise<CommunityTemplateRequestActionResult>;
};

type UseCommunityTemplateRequestResult = {
  communityTemplateRequest: CommunityTemplateRequestWithEvents | null;
  refresh: () => Promise<void>;
  createRequest: () => Promise<boolean>;
  cancelRequest: () => Promise<boolean>;
};

/**
 * Hook for managing community template requests.
 *
 * create/cancel already return the updated request, so the
 * state is applied directly without the extra refetch round trip.
 */
export function useCommunityTemplateRequest({
  entityId,
  getRequest,
  createRequest,
  cancelRequest,
}: UseCommunityTemplateRequestOptions): UseCommunityTemplateRequestResult {
  const [communityTemplateRequest, setCommunityTemplateRequest] =
    useState<CommunityTemplateRequestWithEvents | null>(null);

  const refresh = async () => {
    const result = await getRequest();
    if (result.success) {
      setCommunityTemplateRequest(result.value);
    }
  };

  useEffect(() => {
    void getRequest().then((result) => {
      if (result.success) {
        setCommunityTemplateRequest(result.value);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  return {
    communityTemplateRequest,
    refresh,
    createRequest: async () => {
      const result = await createRequest();
      if (result.success) {
        setCommunityTemplateRequest(result.value);
      }
      return result.success;
    },
    cancelRequest: async () => {
      const result = await cancelRequest();
      if (result.success) {
        setCommunityTemplateRequest(result.value);
      }
      return result.success;
    },
  };
}
