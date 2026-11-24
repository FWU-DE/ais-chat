import { readFileSync } from 'node:fs';

const SERVICE_ACCOUNT_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';

export type KubeConfig = { apiUrl: string; namespace: string; token: () => string };

/** The CA certificate of the API server comes from `NODE_EXTRA_CA_CERTS` (see manifest). */
export function inClusterConfig(namespace?: string): KubeConfig {
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT;
  if (!host || !port) throw new Error('not running in a cluster (KUBERNETES_SERVICE_HOST unset)');
  return {
    apiUrl: `https://${host.includes(':') ? `[${host}]` : host}:${port}`,
    namespace: namespace ?? readFileSync(`${SERVICE_ACCOUNT_DIR}/namespace`, 'utf8').trim(),
    // Read on every request: the projected token rotates.
    token: () => readFileSync(`${SERVICE_ACCOUNT_DIR}/token`, 'utf8').trim(),
  };
}

export class KubeError extends Error {
  readonly status: number;

  constructor(status: number, method: string, path: string) {
    super(`kube ${method} ${path} -> ${status}`);
    this.name = 'KubeError';
    this.status = status;
  }
}

export async function kubeRequest(
  config: KubeConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(config.apiUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${config.token()}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, json };
}
