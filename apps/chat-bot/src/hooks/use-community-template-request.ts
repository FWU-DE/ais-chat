'use client';

import { useEffect, useState } from 'react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import {
  CommunityTemplateRequestWithEvents,
  EntitySharingSnapshot,
} from '@shared/community-templates/community-template-service';

export type CommunityTemplateRequestMutationResult = ServerActionResult<{
  request: CommunityTemplateRequestWithEvents | null;
  entity: EntitySharingSnapshot;
}>;

type UseCommunityTemplateRequestOptions = {
  entityId: string;
  getRequest: () => Promise<ServerActionResult<CommunityTemplateRequestWithEvents | null>>;
  createRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  cancelRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  sendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
};

type UseCommunityTemplateRequestResult = {
  communityTemplateRequest: CommunityTemplateRequestWithEvents | null;
  setCommunityTemplateRequest: (request: CommunityTemplateRequestWithEvents | null) => void;
  refresh: () => Promise<void>;
  createRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  cancelRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  sendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
};

/**
 * Hook for managing community template requests.
 *
 * create/cancel already return the updated request and entity sharing snapshot, so the
 * state is applied directly without the extra refetch round trip. Callers read the full
 * result to sync any other sharing-related state (e.g. form fields) on success or failure.
 */
export function useCommunityTemplateRequest({
  entityId,
  getRequest,
  createRequest,
  cancelRequest,
  sendMessage,
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
    setCommunityTemplateRequest,
    refresh,
    createRequest: async () => {
      const result = await createRequest();
      if (result.success) {
        setCommunityTemplateRequest(result.value.request);
      }
      return result;
    },
    cancelRequest: async () => {
      const result = await cancelRequest();
      if (result.success) {
        setCommunityTemplateRequest(result.value.request);
      }
      return result;
    },
    sendMessage: async (message: string) => {
      const result = await sendMessage(message);
      if (result.success) {
        setCommunityTemplateRequest(result.value.request);
      }
      return result;
    },
  };
}
