import type { LlmProviderKeyWithModels } from '../../functions';
import type { BifrostKey } from '../types';

export function getOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Strips a trailing `/v1` segment from a base URL, if present.
 *
 * Bifrost's built-in request-path templates for OpenAI-compatible providers already include
 * `/v1` (e.g. the default chat completion path is `/v1/chat/completions`), so a configured base
 * URL that also ends in `/v1` would otherwise produce a doubled `.../v1/v1/...` upstream request.
 * Any other path segment is preserved.
 */
export function stripTrailingV1(value: string): string {
  return value.replace(/\/v1\/?$/i, '');
}

export function getBifrostModelName(modelName: string): string {
  return modelName.replace(/^anthropic\//, '');
}

export function buildKey(
  provider: string,
  providerKey: LlmProviderKeyWithModels,
  value: string,
  extra?: Partial<BifrostKey>,
): BifrostKey {
  const activeMappings = providerKey.models.filter(({ model }) => !model.isDeleted);
  const modelMappings = activeMappings.flatMap(({ model, upstreamModelName }) => {
    const bifrostModelName = getBifrostModelName(model.name);
    const bifrostUpstreamModelName = getBifrostModelName(upstreamModelName);
    return [[bifrostModelName, bifrostUpstreamModelName]] as const;
  });
  return {
    name: providerKey.name.toLowerCase(),
    value,
    models: [...new Set(modelMappings.map(([modelName]) => modelName))].sort(),
    aliases: Object.fromEntries(modelMappings),
    weight: providerKey.weight,
    enabled: providerKey.isEnabled,
    ...extra,
  };
}
