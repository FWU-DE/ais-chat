'use client';

import { ServerActionResult } from '@shared/actions/server-action-result';
import {
  CommunityTemplateRequestWithEvents,
  EntitySharingSnapshot,
} from '@shared/community-templates/community-template-service';
import { useState } from 'react';

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
  const runMutation = async <T>(mutation: () => Promise<T>, applyResult: (result: T) => void) => {
    const result = await mutation();
    applyResult(result);
    return result;
  };

  return {
    communityTemplateRequest,
    setCommunityTemplateRequest,
    createRequest: () =>
      runMutation(createRequest, (result) => {
        if (result.success) {
          setCommunityTemplateRequest(result.value.request);
          onSharingStateChange(result.value);
        }
      }),
    cancelRequest: () =>
      runMutation(cancelRequest, (result) => {
        if (result.success) {
          setCommunityTemplateRequest(result.value.request);
          onSharingStateChange(result.value);
        }
      }),
    sendMessage: (message: string) =>
      runMutation(
        () => sendMessage(message),
        (result) => {
          if (result.success) {
            setCommunityTemplateRequest(result.value.request);
          }
        },
      ),
  };
}
