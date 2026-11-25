import type { KubeRequest, KubeResponse } from '../kube-client';

export type KubeCall = { method: string; path: string; body?: unknown; contentType?: string };

/** Replaces `kubeRequest`. Answers come from `respond`, every call is recorded. */
export function fakeKube(respond: (call: KubeCall) => KubeResponse | Promise<KubeResponse>) {
  const calls: KubeCall[] = [];
  const request: KubeRequest = async (method, path, body, contentType) => {
    const call = { method, path, body, contentType };
    calls.push(call);
    return respond(call);
  };
  return { request, calls };
}
