'use client';

import { ServerActionResult } from '@shared/actions/server-action-result';
import { isCommunitySharingActive } from '@shared/community-templates/community-sharing-state';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { useCallback, useRef, useState } from 'react';
import { UseFormSetValue } from 'react-hook-form';

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
    createCommunityTemplateRequest: () => Promise<CommunityTemplateRequestMutationResult>;
    cancelCommunityTemplateRequest: () => Promise<CommunityTemplateRequestMutationResult>;
    sendMessageToEditor: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
    getEntitySharingState: () => Promise<ServerActionResult<CommunitySharingState>>;
    updateSchoolSharing: (isSchoolShared: boolean) => Promise<{ success: boolean }>;
  };
  onError: () => void;
  flushAutoSave: () => Promise<unknown>;
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
  flushAutoSave,
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
    createRequest: actions.createCommunityTemplateRequest,
    cancelRequest: actions.cancelCommunityTemplateRequest,
    sendMessage: actions.sendMessageToEditor,
    onSharingStateChange: applySharingState,
  });

  const [isSharingPending, setIsSharingPending] = useState(false);
  const pendingOperationCount = useRef(0);
  const sharingOperationQueue = useRef(Promise.resolve());

  // One queue orders all request snapshots; only sharing changes need form flushes.
  const runSharingOperation = <T>(
    operation: () => Promise<T>,
    { flushForm = true }: { flushForm?: boolean } = {},
  ) => {
    pendingOperationCount.current += 1;
    setIsSharingPending(true);

    const queuedOperation = sharingOperationQueue.current
      .then(async () => {
        if (flushForm) {
          await flushAutoSave();
        }
        try {
          return await operation();
        } finally {
          if (flushForm) {
            await flushAutoSave();
          }
        }
      })
      .finally(() => {
        pendingOperationCount.current -= 1;
        if (pendingOperationCount.current === 0) {
          setIsSharingPending(false);
        }
      });

    sharingOperationQueue.current = queuedOperation.then(
      () => undefined,
      () => undefined,
    );

    return queuedOperation;
  };

  // Resyncs only the sharing fields after a failed mutation, leaving other unsaved fields untouched.
  const refreshSharingState = async () => {
    const result = await actions.getEntitySharingState();
    if (result.success) {
      applySharingState(result.value);
      setCommunityTemplateRequest(result.value.request);
    }
  };

  const handleSharingChange = ({ name, checked }: { name: string; checked: boolean }) =>
    runSharingOperation(async () => {
      let result: { success: boolean } | undefined;
      if (name === 'isCommunityShared') {
        result = checked ? await createRequest() : await cancelRequest();
      } else if (name === 'isSchoolShared') {
        result = await actions.updateSchoolSharing(checked);
      }

      if (result && !result.success) {
        await refreshSharingState();
        onError();
      }
    });

  const createCommunityTemplateRequest = () => runSharingOperation(() => createRequest());

  return {
    communityTemplateRequest,
    createCommunityTemplateRequest,
    sendMessageToEditor: (message: string) =>
      runSharingOperation(() => sendMessage(message), { flushForm: false }),
    handleSharingChange,
    isSharingPending,
  };
}
