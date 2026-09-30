'use client';

import { useState } from 'react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import {
  CommunityTemplateRequestWithEvents,
  EntitySharingSnapshot,
} from '@shared/community-templates/community-template-service';

export type CommunitySharingState = {
  request: CommunityTemplateRequestWithEvents | null;
  entity: EntitySharingSnapshot;
};

export type CommunityTemplateRequestMutationResult = ServerActionResult<CommunitySharingState>;

type UseCommunityTemplateRequestOptions = {
  initialRequest: CommunityTemplateRequestWithEvents | null;
  createRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  cancelRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  sendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
  onSharingStateChange: (state: CommunitySharingState) => void;
};

type UseCommunityTemplateRequestResult = {
  communityTemplateRequest: CommunityTemplateRequestWithEvents | null;
  setCommunityTemplateRequest: (request: CommunityTemplateRequestWithEvents | null) => void;
  createRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  cancelRequest: () => Promise<CommunityTemplateRequestMutationResult>;
  sendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
};

/**
 * Hook for managing community template requests.
 *
 * create/cancel already return the updated request and entity sharing snapshot, so the
 * state is applied directly without the extra refetch round trip. `onSharingStateChange`
 * is called after a successful create/cancel so callers can sync their sharing form fields.
 */
export function useCommunityTemplateRequest({
  initialRequest,
  createRequest,
  cancelRequest,
  sendMessage,
  onSharingStateChange,
}: UseCommunityTemplateRequestOptions): UseCommunityTemplateRequestResult {
  const [communityTemplateRequest, setCommunityTemplateRequest] =
    useState<CommunityTemplateRequestWithEvents | null>(initialRequest);

  return {
    communityTemplateRequest,
    setCommunityTemplateRequest,
    createRequest: async () => {
      const result = await createRequest();
      if (result.success) {
        setCommunityTemplateRequest(result.value.request);
        onSharingStateChange(result.value);
      }
      return result;
    },
    cancelRequest: async () => {
      const result = await cancelRequest();
      if (result.success) {
        setCommunityTemplateRequest(result.value.request);
        onSharingStateChange(result.value);
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
