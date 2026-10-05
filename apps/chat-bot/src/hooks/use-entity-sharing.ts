'use client';

import { useCallback } from 'react';
import { UseFormSetValue } from 'react-hook-form';
import { ServerActionResult } from '@shared/actions/server-action-result';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { isCommunitySharingActive } from '@shared/community-templates/community-sharing-state';
import {
  CommunitySharingState,
  CommunityTemplateRequestMutationResult,
  useCommunityTemplateRequest,
} from '@/hooks/use-community-template-request';

export type SharingFormFields = {
  isSchoolShared: boolean;
  isCommunityShared: boolean;
  hasLinkAccess: boolean;
};

type UseEntitySharingOptions<TFormValues extends SharingFormFields> = {
  setValue: UseFormSetValue<TFormValues>;
  initialRequest: CommunityTemplateRequestWithEvents | null;
  actions: {
    createRequest: () => Promise<CommunityTemplateRequestMutationResult>;
    cancelRequest: () => Promise<CommunityTemplateRequestMutationResult>;
    sendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
    getSharingState: () => Promise<ServerActionResult<CommunitySharingState>>;
    updateSchoolSharing: (isSchoolShared: boolean) => Promise<{ success: boolean }>;
  };
  onError: () => void;
  onSuccess: () => Promise<unknown>;
};

/**
 * Shared sharing logic of the entity editors (character, assistant, learning scenario):
 * community template requests, school sharing and syncing the sharing form fields.
 */
export function useEntitySharing<TFormValues extends SharingFormFields>({
  setValue,
  initialRequest,
  actions,
  onError,
  onSuccess,
}: UseEntitySharingOptions<TFormValues>) {
  const applySharingState = useCallback(
    ({ entity, request }: CommunitySharingState) => {
      // react-hook-form cannot resolve Path<TFormValues> for a generic form type
      const setSharingValue = setValue as unknown as UseFormSetValue<SharingFormFields>;
      setSharingValue('isSchoolShared', entity.isSchoolShared, { shouldDirty: false });
      setSharingValue(
        'isCommunityShared',
        isCommunitySharingActive({
          isCommunityShared: entity.isCommunityShared,
          requestState: request?.state,
        }),
        { shouldDirty: false },
      );
      setSharingValue('hasLinkAccess', entity.hasLinkAccess, { shouldDirty: false });
    },
    [setValue],
  );

  const {
    communityTemplateRequest,
    setCommunityTemplateRequest,
    createRequest,
    cancelRequest,
    sendMessage,
  } = useCommunityTemplateRequest({
    initialRequest,
    createRequest: actions.createRequest,
    cancelRequest: actions.cancelRequest,
    sendMessage: actions.sendMessage,
    onSharingStateChange: applySharingState,
  });

  // Resyncs only the sharing fields after a failed mutation, leaving other unsaved fields untouched.
  const refreshSharingState = async () => {
    const result = await actions.getSharingState();
    if (result.success) {
      applySharingState(result.value);
      setCommunityTemplateRequest(result.value.request);
    }
  };

  const handleSharingChange = async ({ name, checked }: { name: string; checked: boolean }) => {
    let result: { success: boolean } | undefined;
    if (name === 'isCommunityShared') {
      result = checked ? await createRequest() : await cancelRequest();
    } else if (name === 'isSchoolShared') {
      result = await actions.updateSchoolSharing(checked);
    }

    if (result && !result.success) {
      await refreshSharingState();
      onError();
      return;
    }

    await onSuccess();
  };

  return {
    communityTemplateRequest,
    createCommunityTemplateRequest: createRequest,
    sendMessageToEditor: sendMessage,
    handleSharingChange,
  };
}
