import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

type Key = {
  id: string;
  name: string;
  value: string;
  models: string[];
  weight: number;
  enabled?: boolean;
};
type KeyValue = string | { value: string };
const clearText = (value: KeyValue) => (typeof value === 'string' ? value : value.value);
type Provider = { name: string; keys: Key[]; extra: Record<string, unknown> };
type VirtualKey = { id: string; provider_configs: Record<string, unknown>[] };

/** Shared Postgres of all fake pods. */
export class FakeDb {
  providers = new Map<string, Provider>();
  virtualKeys: VirtualKey[] = [{ id: 'vk-all', provider_configs: [] }];

  clone(): { providers: Map<string, Provider>; virtualKeys: VirtualKey[] } {
    return structuredClone({ providers: this.providers, virtualKeys: this.virtualKeys });
  }
}

export type FakeRequest = {
  pod: string;
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
};

export type FaultRule = (request: FakeRequest) => boolean;

/** Makes the fake store something other than what it was sent, like a Bifrost bug would. */
export type Quirks = { rewriteKey?: (key: Key) => Key };

/** Fields Bifrost adds on its own (measured on v2.5.1). The sync does not set them. */
const NETWORK_DEFAULTS = {
  default_request_timeout_in_seconds: 300,
  max_retries: 0,
  retry_backoff_initial: 500,
  retry_backoff_max: 5000,
  stream_idle_timeout_in_seconds: 120,
  keep_alive_timeout_in_seconds: 30,
  max_conns_per_host: 5000,
};

const withNetworkDefaults = (networkConfig: unknown) =>
  networkConfig ? { ...NETWORK_DEFAULTS, ...(networkConfig as object) } : undefined;

/** Key fields Bifrost sets on write and returns on read. */
const KEY_DEFAULTS = {
  status: 'unknown',
  description: '',
  blacklisted_models: [] as string[],
  use_for_batch_api: false,
};

export const mask = (value: string) => `${value.slice(0, 4)}************${value.slice(-2)}`;

/**
 * One Bifrost pod. It reads its config from the DB at start (`reload`) and keeps it in memory.
 * Writes go to memory and DB. Like the measured Bifrost, GET masks key values and a provider PUT
 * on a pod whose key IDs differ from the DB fails with 500.
 */
export class FakePod {
  memory!: { providers: Map<string, Provider>; virtualKeys: VirtualKey[] };
  healthy = true;
  private server!: Server;
  baseUrl = '';

  constructor(
    readonly name: string,
    private readonly db: FakeDb,
    private readonly events: string[],
    private readonly faults: () => FaultRule[],
    private readonly requests: FakeRequest[],
    private readonly quirks: () => Quirks = () => ({}),
  ) {
    this.reload();
  }

  reload(): void {
    this.memory = this.db.clone();
  }

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
        const url = new URL(req.url ?? '/', 'http://x');
        const entry: FakeRequest = {
          pod: this.name,
          method: req.method ?? 'GET',
          path: url.pathname,
          body,
        };
        this.requests.push(entry);
        if (entry.method === 'GET' && entry.path === '/api/providers') {
          this.events.push(`GET /api/providers ${this.name}`);
        }
        const [status, payload] = this.handle(entry, url);
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private rewrite(key: Key): Key {
    return this.quirks().rewriteKey?.(key) ?? key;
  }

  private ids(providers: Map<string, Provider>, name: string): string {
    return (providers.get(name)?.keys ?? [])
      .map((k) => k.id)
      .sort()
      .join(',');
  }

  private handle(req: FakeRequest, url: URL): [number, unknown] {
    const isWrite = req.method !== 'GET';
    if (isWrite && this.faults().some((rule) => rule(req))) {
      // The error body repeats request data, like a careless upstream would.
      return [500, { error: { message: `boom ${JSON.stringify(req.body)}` } }];
    }
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const { providers, virtualKeys } = this.memory;

    if (url.pathname === '/api/providers') {
      if (req.method === 'GET') {
        if (!this.healthy) return [500, { error: 'failed to decrypt key value' }];
        return [
          200,
          { providers: [...providers.values()].map((p) => ({ name: p.name, ...p.extra })) },
        ];
      }
      const name = req.body!.provider as string;
      const provider: Provider = {
        name,
        keys: [],
        extra: {
          network_config: withNetworkDefaults(req.body!.network_config),
          ...(req.body!.custom_provider_config
            ? {
                custom_provider_config: {
                  is_key_less: false,
                  does_not_send_done_marker: false,
                  ...(req.body!.custom_provider_config as object),
                },
              }
            : {}),
        },
      };
      providers.set(name, provider);
      this.db.providers.set(name, structuredClone(provider));
      return [200, { ok: true }];
    }

    if (segments[0] === 'api' && segments[1] === 'providers' && segments[2]) {
      const name = segments[2];
      const provider = providers.get(name);
      if (segments.length === 3) {
        if (req.method === 'DELETE') {
          providers.delete(name);
          this.db.providers.delete(name);
          return [provider ? 200 : 404, {}];
        }
        if (!provider) return [404, {}];
        if (req.method === 'GET') return [200, { name, ...provider.extra }];
        if (this.ids(providers, name) !== this.ids(this.db.providers, name)) {
          return [500, { error: 'API key names must be unique across providers' }];
        }
        // Measured: a PUT without `network_config` resets it.
        const { network_config: networkConfig, ...rest } = req.body!;
        provider.extra = {
          ...provider.extra,
          ...rest,
          network_config: withNetworkDefaults(networkConfig),
        };
        this.db.providers.get(name)!.extra = structuredClone(provider.extra);
        return [200, {}];
      }
      if (!provider) return [404, {}];
      const dbProvider = this.db.providers.get(name)!;
      if (segments[3] === 'keys' && segments.length === 4) {
        if (req.method === 'GET') {
          return [
            200,
            { keys: provider.keys.map((k) => ({ ...KEY_DEFAULTS, ...k, value: mask(k.value) })) },
          ];
        }
        const body = req.body as unknown as Omit<Key, 'id' | 'value'> & { value: KeyValue };
        const value = clearText(body.value);
        const key: Key = this.rewrite({ ...body, id: randomUUID(), value });
        provider.keys.push(key);
        dbProvider.keys.push(structuredClone(key));
        return [200, {}];
      }
      if (segments[3] === 'keys' && segments[4]) {
        const id = segments[4];
        const index = provider.keys.findIndex((k) => k.id === id);
        if (index < 0) return [404, {}];
        if (req.method === 'DELETE') {
          provider.keys.splice(index, 1);
          const dbIndex = dbProvider.keys.findIndex((k) => k.id === id);
          if (dbIndex >= 0) dbProvider.keys.splice(dbIndex, 1);
          return [200, {}];
        }
        const body = req.body as unknown as Omit<Key, 'value'> & { value: KeyValue };
        const value = clearText(body.value);
        const updated = this.rewrite({ ...body, id, value });
        provider.keys[index] = updated;
        const dbIndex = dbProvider.keys.findIndex((k) => k.id === id);
        if (dbIndex >= 0) dbProvider.keys[dbIndex] = structuredClone(updated);
        return [200, {}];
      }
    }

    if (url.pathname === '/api/governance/virtual-keys' && req.method === 'GET') {
      return [200, { virtual_keys: virtualKeys, total_count: virtualKeys.length }];
    }
    if (segments[2] === 'virtual-keys' && segments[3] && req.method === 'PUT') {
      const vk = virtualKeys.find((v) => v.id === segments[3]);
      if (!vk) return [404, {}];
      const sent = req.body!.provider_configs as { key_ids?: string[] }[];
      vk.provider_configs = sent.map(({ key_ids, ...rest }, index) => ({
        ...rest,
        id: index + 1,
        virtual_key_id: vk.id,
        allow_all_keys: key_ids?.includes('*') ?? false,
        keys: [],
        blacklisted_models: [],
      }));
      const dbVk = this.db.virtualKeys.find((v) => v.id === vk.id);
      if (dbVk) dbVk.provider_configs = structuredClone(vk.provider_configs);
      return [200, {}];
    }
    return [404, { error: 'not found' }];
  }
}

/** A pod that lost its extras: turns a field of a stored key into something else, to test the read back. */
export const keyOf = (name: string, value: string, models = ['fast']): Omit<Key, 'id'> => ({
  name,
  value,
  models,
  weight: 1,
});
