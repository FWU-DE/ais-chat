// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CommunitySharingState,
  CommunityTemplateRequestMutationResult,
} from './use-community-template-request';
import { type SharingFormFields, useEntitySharing } from './use-entity-sharing';

type TestFormValues = SharingFormFields & { author: string };

type HookResult = ReturnType<typeof useEntitySharing<TestFormValues>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function sharingState(
  overrides: Partial<CommunitySharingState['entity']> = {},
): CommunitySharingState {
  return {
    entity: {
      isSchoolShared: false,
      isCommunityShared: false,
      hasLinkAccess: false,
      ...overrides,
    },
    request: null,
  };
}

function success(value: CommunitySharingState) {
  return { success: true as const, value };
}

function failure(message = 'mutation failed'): CommunityTemplateRequestMutationResult {
  return {
    success: false,
    error: { message, name: 'TestError', statusCode: 500 },
  };
}

function renderSharingHook(options: {
  actions: Parameters<typeof useEntitySharing<TestFormValues>>[0]['actions'];
  initialRequest?: Parameters<typeof useEntitySharing<TestFormValues>>[0]['initialRequest'];
  onError?: () => void;
  flushAutoSave?: () => Promise<unknown>;
}) {
  const setValue = vi.fn();
  const result: { current: HookResult | undefined } = { current: undefined };
  let root: Root;

  function Harness({ children }: { children?: ReactNode }) {
    result.current = useEntitySharing<TestFormValues>({
      setValue,
      initialRequest: options.initialRequest ?? null,
      actions: options.actions,
      onError: options.onError ?? vi.fn(),
      flushAutoSave: options.flushAutoSave ?? (async () => undefined),
    });

    return children ?? null;
  }

  act(() => {
    root = createRoot(document.createElement('div'));
    root.render(<Harness />);
  });

  return {
    result,
    setValue,
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

function getResult(result: { current: HookResult | undefined }) {
  if (!result.current) {
    throw new Error('hook did not render');
  }

  return result.current;
}

describe('useEntitySharing mutation lifecycle', () => {
  const mounted: Array<() => void> = [];

  afterEach(() => {
    mounted.splice(0).forEach((unmount) => unmount());
  });

  it('keeps community cancellation pending until the snapshot and final flush finish', async () => {
    const initialFlush = deferred<unknown>();
    const mutation = deferred<ReturnType<typeof success>>();
    const finalFlush = deferred<unknown>();
    const flushAutoSave = vi
      .fn<() => Promise<unknown>>()
      .mockImplementationOnce(() => initialFlush.promise)
      .mockImplementationOnce(() => finalFlush.promise);
    const actions = {
      createCommunityTemplateRequest: vi.fn(),
      cancelCommunityTemplateRequest: vi.fn(() => mutation.promise),
      sendMessageToEditor: vi.fn(),
      getEntitySharingState: vi.fn(),
      updateSchoolSharing: vi.fn(),
    };
    const harness = renderSharingHook({ actions, flushAutoSave });
    mounted.push(harness.unmount);

    let operation!: Promise<unknown>;
    await act(async () => {
      operation = getResult(harness.result).handleSharingChange({
        name: 'isCommunityShared',
        checked: false,
      });
      await Promise.resolve();
    });

    expect(getResult(harness.result).isSharingPending).toBe(true);
    expect(actions.cancelCommunityTemplateRequest).not.toHaveBeenCalled();

    await act(async () => {
      initialFlush.resolve(undefined);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(actions.cancelCommunityTemplateRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      mutation.resolve(success(sharingState({ hasLinkAccess: false })));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getResult(harness.result).isSharingPending).toBe(true);
    expect(harness.setValue).toHaveBeenCalledWith('hasLinkAccess', false, { shouldDirty: false });

    await act(async () => {
      finalFlush.resolve(undefined);
      await operation;
    });

    expect(getResult(harness.result).isSharingPending).toBe(false);
  });

  it('refreshes only sharing fields after a failed mutation and preserves author fields', async () => {
    const onError = vi.fn();
    const actions = {
      createCommunityTemplateRequest: vi.fn(),
      cancelCommunityTemplateRequest: vi.fn(async () => failure()),
      sendMessageToEditor: vi.fn(),
      getEntitySharingState: vi.fn(async () => success(sharingState({ hasLinkAccess: true }))),
      updateSchoolSharing: vi.fn(),
    };
    const harness = renderSharingHook({ actions, onError });
    mounted.push(harness.unmount);

    await act(async () => {
      await getResult(harness.result).handleSharingChange({
        name: 'isCommunityShared',
        checked: false,
      });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(actions.getEntitySharingState).toHaveBeenCalledTimes(1);
    expect(harness.setValue.mock.calls.map(([name]) => name)).toEqual([
      'isSchoolShared',
      'isCommunityShared',
      'hasLinkAccess',
    ]);
    expect(harness.setValue).not.toHaveBeenCalledWith(
      'author',
      expect.anything(),
      expect.anything(),
    );
    expect(getResult(harness.result).isSharingPending).toBe(false);
  });

  it('serializes messages and sharing actions without allowing an earlier completion to clear pending state', async () => {
    const messageMutation = deferred<ReturnType<typeof success>>();
    const firstMutation = deferred<ReturnType<typeof success>>();
    const secondMutation = deferred<{ success: boolean }>();
    const finalFlush = deferred<unknown>();
    const flushAutoSave = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => finalFlush.promise)
      .mockResolvedValue(undefined);
    const actions = {
      createCommunityTemplateRequest: vi.fn(),
      cancelCommunityTemplateRequest: vi.fn(() => firstMutation.promise),
      sendMessageToEditor: vi.fn(() => messageMutation.promise),
      getEntitySharingState: vi.fn(),
      updateSchoolSharing: vi.fn(() => secondMutation.promise),
    };
    const harness = renderSharingHook({ actions, flushAutoSave });
    mounted.push(harness.unmount);

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    let message!: Promise<unknown>;
    await act(async () => {
      message = getResult(harness.result).sendMessageToEditor('Review my template');
      first = getResult(harness.result).handleSharingChange({
        name: 'isCommunityShared',
        checked: false,
      });
      second = getResult(harness.result).handleSharingChange({
        name: 'isSchoolShared',
        checked: true,
      });
      await Promise.resolve();
    });

    expect(actions.updateSchoolSharing).not.toHaveBeenCalled();
    expect(actions.cancelCommunityTemplateRequest).not.toHaveBeenCalled();
    expect(actions.sendMessageToEditor).toHaveBeenCalledTimes(1);
    expect(flushAutoSave).not.toHaveBeenCalled();
    expect(getResult(harness.result).isSharingPending).toBe(true);

    await act(async () => {
      messageMutation.resolve(success(sharingState({ hasLinkAccess: true })));
      await message;
    });

    expect(actions.cancelCommunityTemplateRequest).toHaveBeenCalledTimes(1);
    expect(harness.setValue).not.toHaveBeenCalled();
    expect(getResult(harness.result).isSharingPending).toBe(true);

    await act(async () => {
      firstMutation.resolve(success(sharingState({ hasLinkAccess: false })));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getResult(harness.result).isSharingPending).toBe(true);

    await act(async () => {
      finalFlush.resolve(undefined);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(actions.updateSchoolSharing).toHaveBeenCalledTimes(1);
    expect(getResult(harness.result).isSharingPending).toBe(true);

    await act(async () => {
      secondMutation.resolve({ success: true });
      await Promise.all([first, second]);
    });

    expect(getResult(harness.result).isSharingPending).toBe(false);
    expect(flushAutoSave).toHaveBeenCalledTimes(4);
  });

  it('preserves the direct create mutation result while exposing its pending lifecycle', async () => {
    const flushAutoSave = vi.fn(async () => false);
    const mutationResult = success(sharingState({ isCommunityShared: true }));
    const actions = {
      createCommunityTemplateRequest: vi.fn(async () => mutationResult),
      cancelCommunityTemplateRequest: vi.fn(),
      sendMessageToEditor: vi.fn(async () => mutationResult),
      getEntitySharingState: vi.fn(),
      updateSchoolSharing: vi.fn(),
    };
    const harness = renderSharingHook({ actions, flushAutoSave });
    mounted.push(harness.unmount);

    let result: unknown;
    await act(async () => {
      result = await getResult(harness.result).createCommunityTemplateRequest();
    });

    expect(result).toBe(mutationResult);
    expect(actions.createCommunityTemplateRequest).toHaveBeenCalledTimes(1);
    expect(flushAutoSave).toHaveBeenCalledTimes(2);
    expect(getResult(harness.result).isSharingPending).toBe(false);

    let messageResult: unknown;
    await act(async () => {
      messageResult = await getResult(harness.result).sendMessageToEditor('Review my template');
    });

    expect(messageResult).toBe(mutationResult);
    expect(flushAutoSave).toHaveBeenCalledTimes(2);
  });

  it('clears pending after a rejected flush and can run the next queued action', async () => {
    const flushFailure = new Error('author save failed');
    const flushAutoSave = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(flushFailure)
      .mockResolvedValue(undefined);
    const actions = {
      createCommunityTemplateRequest: vi.fn(),
      cancelCommunityTemplateRequest: vi.fn(async () => success(sharingState())),
      sendMessageToEditor: vi.fn(),
      getEntitySharingState: vi.fn(),
      updateSchoolSharing: vi.fn(async () => ({ success: true })),
    };
    const harness = renderSharingHook({ actions, flushAutoSave });
    mounted.push(harness.unmount);

    await expect(
      getResult(harness.result).handleSharingChange({
        name: 'isCommunityShared',
        checked: false,
      }),
    ).rejects.toBe(flushFailure);

    expect(actions.cancelCommunityTemplateRequest).not.toHaveBeenCalled();
    expect(getResult(harness.result).isSharingPending).toBe(false);

    await act(async () => {
      await getResult(harness.result).handleSharingChange({
        name: 'isSchoolShared',
        checked: true,
      });
    });

    expect(actions.updateSchoolSharing).toHaveBeenCalledTimes(1);
    expect(getResult(harness.result).isSharingPending).toBe(false);
  });
});
