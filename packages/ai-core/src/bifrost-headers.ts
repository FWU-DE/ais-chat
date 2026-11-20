/**
 * Bifrost-specific routed-identity fields: the real upstream provider/model that served a
 * request. Deliberately sourced only from the `x-bifrost-*` response headers (see
 * `extractBifrostFieldsFromHeaders`), not from the response body's `extra_fields`.
 *
 * Bifrost's own source notes that streamed chunks only carry `extra_fields` inconsistently (see
 * `ApplyBifrostStreamResponseHeaders` in bifrost's transport layer), and in practice the body can
 * carry a stale, empty snapshot instead of the final value on streaming requests — exactly where
 * this information is needed (e.g. to report the real provider/model on chat's `new_chat_message`
 * event). The headers are emitted before the body starts (streaming included) and are Bifrost's
 * documented, reliable mechanism for recovering routed identity, so they're used exclusively, by
 * every Bifrost-backed provider (chat, images, ...).
 */
export type BifrostExtraFields = {
  provider?: string;
  // Bifrost returns the originally requested model and the deployment that served it.
  // The deployment may identify a fallback, but it can also be an upstream-specific alias.
  original_model_requested?: string;
  resolved_model_used?: string;
};

// `x-bifrost-routing-info-*` are the current headers; the `x-bifrost-provider`/
// `x-bifrost-original-model`/`x-bifrost-resolved-model` headers are deprecated but still emitted
// for backward compatibility, so they're used as a fallback here.
const BIFROST_PROVIDER_HEADERS = ['x-bifrost-routing-info-provider', 'x-bifrost-provider'];
const BIFROST_REQUESTED_MODEL_HEADERS = [
  'x-bifrost-routing-info-requested-model',
  'x-bifrost-original-model',
];
const BIFROST_RESOLVED_MODEL_HEADERS = ['x-bifrost-routing-info-model', 'x-bifrost-resolved-model'];

function getFirstHeader(headers: Headers, names: string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }
  return undefined;
}

// Reads the routed-identity headers Bifrost emits on every successful response (streaming
// included) before the body starts. See the comment on `BifrostExtraFields` for why this is the
// sole source, instead of the response body's `extra_fields`.
export function extractBifrostFieldsFromHeaders(headers: Headers): BifrostExtraFields {
  return {
    provider: getFirstHeader(headers, BIFROST_PROVIDER_HEADERS),
    original_model_requested: getFirstHeader(headers, BIFROST_REQUESTED_MODEL_HEADERS),
    resolved_model_used: getFirstHeader(headers, BIFROST_RESOLVED_MODEL_HEADERS),
  };
}

/** Strips the `provider/` prefix Bifrost sometimes adds to the deployment name it reports. */
export function stripBifrostProviderPrefix(
  deployment: string | undefined,
  provider: string | undefined,
): string | undefined {
  return deployment && provider && deployment.startsWith(`${provider}/`)
    ? deployment.slice(provider.length + 1)
    : deployment;
}
