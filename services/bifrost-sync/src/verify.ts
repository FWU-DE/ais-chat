import {
  BIFROST_PROVIDERS,
  type BifrostKey,
  type BifrostKeyAlias,
  type BifrostProviderConfig,
  type BifrostProviderResponse,
  type BifrostSecret,
  listBifrostProviderKeys,
  listBifrostProviders,
  listBifrostVirtualKeys,
} from '@ais-chat/api-database/bifrost-provider-sync/core';

import { type BifrostTarget, connectionOf, describeError, silentLogger } from './bifrost-sync-core';
import type { SyncError } from './types';

/*
 * Reads the state back from the pod that did the writes and compares it with `desired`.
 *
 * Only fields the sync sets are compared. Bifrost adds defaults of its own (`network_config`
 * timeouts and connection limits, key `status` and `description`, flags on virtual key access).
 * Key values are not compared: Bifrost returns them masked. Of the Azure and Vertex key
 * configs only the endpoint and the region come back readable, so only those are compared.
 *
 * This catches a write that Bifrost accepted but stored differently. It does not catch wrong
 * provider credentials, wrong model names at the provider, or a wrong `BIFROST_ENCRYPTION_KEY`:
 * the writing pod runs with the right key in memory, only restarted pods load with the wrong one.
 */

/** Virtual key access as Bifrost returns it. On write the sync sends `key_ids: ['*']`, on read Bifrost says `allow_all_keys`. */
type ReadVirtualKeyProviderConfig = {
  provider: string;
  allowed_models?: string[];
  allow_all_keys?: boolean;
  key_ids?: string[];
};

const NATIVE_PROVIDERS = new Set<string>(BIFROST_PROVIDERS);

const sorted = (values: string[] = []) => [...values].sort();
const sameSet = (a: string[] = [], b: string[] = []) =>
  JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const trimSlash = (value: string | undefined | null) => (value ? value.replace(/\/+$/, '') : '');

const secretText = (secret: BifrostSecret | undefined) =>
  typeof secret === 'string' ? secret : (secret?.value ?? '');

/**
 * Bifrost returns `{ model_id }` without a speech flag as the plain string, and no aliases as
 * `null` (measured on v2.5.1). Both forms are brought to one shape before they are compared.
 */
function normalizeAliases(aliases: Record<string, BifrostKeyAlias> | null | undefined): string {
  const entries = Object.entries(aliases ?? {})
    .map(([model, alias]): [string, { upstream: string; speech: boolean }] => [
      model,
      typeof alias === 'string'
        ? { upstream: alias, speech: false }
        : { upstream: alias.model_id, speech: alias.use_speech_endpoints === true },
    ])
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function trueKeys(requests: Record<string, boolean> | undefined): string[] {
  return Object.entries(requests ?? {})
    .filter(([, allowed]) => allowed)
    .map(([name]) => name);
}

function compareProvider(
  desired: BifrostProviderConfig,
  actual: BifrostProviderResponse,
): SyncError[] {
  const provider = desired.provider;
  const mismatch = (message: string): SyncError => ({ provider, step: 'verify', message });
  const errors: SyncError[] = [];

  // An omitted `network_config` keeps the current value on update, so only a given one is compared.
  if (desired.network_config) {
    const wantedUrl = trimSlash(desired.network_config.base_url);
    const actualUrl = trimSlash(actual.network_config?.base_url);
    if (wantedUrl !== actualUrl) errors.push(mismatch('network_config.base_url differs'));
    const wantedPrivate = desired.network_config.allow_private_network ?? false;
    const actualPrivate = actual.network_config?.allow_private_network ?? false;
    if (wantedPrivate !== actualPrivate) {
      errors.push(mismatch('network_config.allow_private_network differs'));
    }
  }

  const wantedCustom = desired.custom_provider_config;
  const actualCustom = actual.custom_provider_config;
  if (wantedCustom) {
    if (wantedCustom.base_provider_type !== actualCustom?.base_provider_type) {
      errors.push(mismatch('custom_provider_config.base_provider_type differs'));
    }
    // Absent `allowed_requests` means "all allowed" and Bifrost may omit it on read.
    if (
      wantedCustom.allowed_requests &&
      !sameSet(trueKeys(wantedCustom.allowed_requests), trueKeys(actualCustom?.allowed_requests))
    ) {
      errors.push(mismatch('custom_provider_config.allowed_requests differs'));
    }
  } else if (actualCustom) {
    // Bifrost does not let a provider lose its custom config (400 `cannot be removed after creation`).
    errors.push(mismatch('custom_provider_config cannot be removed'));
  }
  return errors;
}

function compareKeys(desired: BifrostProviderConfig, actualKeys: BifrostKey[]): SyncError[] {
  const provider = desired.provider;
  const errors: SyncError[] = [];
  const actualByName = new Map(actualKeys.map((key) => [key.name.toLowerCase(), key]));
  const desiredNames = new Set(desired.keys.map((key) => key.name.toLowerCase()));

  for (const key of desired.keys) {
    const actual = actualByName.get(key.name.toLowerCase());
    if (!actual) {
      errors.push({ provider, step: 'verify', message: `key ${key.name} is missing` });
      continue;
    }
    const differs = (field: string, verb = 'differs') =>
      errors.push({ provider, step: 'verify', message: `key ${key.name}: ${field} ${verb}` });
    if (!sameSet(key.models, actual.models)) differs('models', 'differ');
    if (key.weight !== actual.weight) differs('weight');
    if ((key.enabled ?? true) !== (actual.enabled ?? true)) differs('enabled');
    if (normalizeAliases(key.aliases) !== normalizeAliases(actual.aliases))
      differs('aliases', 'differ');
    // Bifrost returns the endpoint and the region readable. Project, credentials and the key value are masked.
    if (
      key.azure_key_config &&
      trimSlash(secretText(key.azure_key_config.endpoint)) !==
        trimSlash(secretText(actual.azure_key_config?.endpoint))
    ) {
      differs('azure_key_config.endpoint');
    }
    if (
      key.vertex_key_config &&
      secretText(key.vertex_key_config.region) !== secretText(actual.vertex_key_config?.region)
    ) {
      differs('vertex_key_config.region');
    }
  }
  for (const name of actualByName.keys()) {
    if (!desiredNames.has(name)) {
      errors.push({ provider, step: 'verify', message: `key ${name} should not exist` });
    }
  }
  return errors;
}

function compareVirtualKeys(
  desired: BifrostProviderConfig[],
  virtualKeys: { id: string; provider_configs: ReadVirtualKeyProviderConfig[] }[],
): SyncError[] {
  const errors: SyncError[] = [];
  const allowedByProvider = new Map(
    desired.map((config) => [
      config.provider,
      [...new Set(config.keys.flatMap((key) => key.models))],
    ]),
  );
  const managed = new Set<string>([...NATIVE_PROVIDERS, ...allowedByProvider.keys()]);

  for (const virtualKey of virtualKeys) {
    const byProvider = new Map(virtualKey.provider_configs.map((c) => [c.provider, c]));
    const fail = (provider: string, message: string) =>
      errors.push({
        provider,
        step: 'verify',
        message: `virtual key ${virtualKey.id}: ${message}`,
      });

    for (const [provider, allowedModels] of allowedByProvider) {
      const actual = byProvider.get(provider);
      if (!actual) {
        fail(provider, 'access is missing');
        continue;
      }
      if (!sameSet(allowedModels, actual.allowed_models)) fail(provider, 'allowed_models differ');
      if (!(actual.allow_all_keys === true || actual.key_ids?.includes('*'))) {
        fail(provider, 'does not allow all keys');
      }
    }
    for (const provider of byProvider.keys()) {
      if (managed.has(provider) && !allowedByProvider.has(provider)) {
        fail(provider, 'access should not exist');
      }
    }
  }
  return errors;
}

/** Returns a `verify` error for every difference. A read that fails is an error, too. */
export async function verifyState(
  target: BifrostTarget,
  desired: BifrostProviderConfig[],
): Promise<SyncError[]> {
  const connection = { ...connectionOf(target), logger: silentLogger };
  try {
    const actualProviders = await listBifrostProviders(connection);
    const byName = new Map(actualProviders.map((p) => [p.name, p]));
    const errors: SyncError[] = [];

    for (const config of desired) {
      const actual = byName.get(config.provider);
      if (!actual) {
        errors.push({ provider: config.provider, step: 'verify', message: 'provider is missing' });
        continue;
      }
      errors.push(...compareProvider(config, actual));
      const keys = await listBifrostProviderKeys({ ...connection, provider: config.provider });
      errors.push(...compareKeys(config, keys));
    }
    const wanted = new Set(desired.map((config) => config.provider));
    for (const name of byName.keys()) {
      if (name && !wanted.has(name)) {
        errors.push({ provider: name, step: 'verify', message: 'provider should not exist' });
      }
    }

    const virtualKeys = await listBifrostVirtualKeys(connection);
    errors.push(...compareVirtualKeys(desired, virtualKeys));
    return errors;
  } catch (error) {
    return [
      { provider: '*', step: 'verify', message: `read back failed: ${describeError(error)}` },
    ];
  }
}
