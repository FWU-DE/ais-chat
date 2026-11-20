export const regexes = {
  // Require at least one dot and only valid DNS label characters.
  domain: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
  url: /(https?:\/\/)(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi,
  urlWithOptionalProtocol:
    /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi,
};

/**
 * Strips the protocol and "www." prefix from a URL for display purposes.
 * Also converts the URL to lowercase for consistent display.
 *
 * Examples:
 * - `https://www.example.com` -> `example.com`
 * - `http://example.com` -> `example.com`
 * - `https://sub.domain.co.uk` -> `sub.domain.co.uk`
 *
 * @param uri The URL string to strip the prefix from.
 * @returns The URL without the protocol and "www." prefix.
 */
export function getDisplayUrl(uri: string) {
  if (!uri) {
    return '';
  }
  return uri.replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();
}

/**
 * Parses HTTP/HTTPS URLs from content.
 *
 * URL Pattern Components:
 * | Component  | Pattern                          | Matches                                |
 * |------------|----------------------------------|----------------------------------------|
 * | Protocol   | `https?:\/\/`                    | `http://` or `https://`                |
 * | www prefix | `(www\.)?`                       | Optional `www.`                        |
 * | Domain     | `[-a-zA-Z0-9@:%._+~#=]{1,256}`   | alphanumeric and special chars (1-256) |
 * | TLD        | `\.[a-zA-Z0-9()]{1,24}`          | `.com`, `.org`, etc. (1-24 chars)      |
 * | Path/Query | `([-a-zA-Z0-9()@:%_+.~#?&/=]*)`  | Optional path, query params, fragments |
 *
 * Examples matched:
 * - `https://example.com`
 * - `http://www.example.org/path?query=1`
 * - `https://sub.domain.co.uk/page#section`
 *
 * @param content The string content to parse for URLs.
 * @returns An array of URLs found in the content, or undefined if none are found.
 */
export function parseHyperlinks(content: string): string[] | undefined {
  const matches = content.match(regexes.url) || [];
  if (matches[0] === undefined) {
    return undefined;
  }

  return matches;
}

/**
 * Normalizes a URL to a domain.
 *
 * Accepted inputs (all produce `example.com`):
 * - `example.com`
 * - `EXAMPLE.COM`
 * - `www.example.com`
 * - `https://example.com`
 * - `https://www.example.com/some/path?q=1#frag`
 *
 * Returns `null` for input that is empty, contains no dot, has an invalid
 * hostname, or cannot be parsed as a URL. Subdomains other than `www` are
 * preserved (e.g. `api.example.com` stays as-is).
 *
 * @param input The raw URL.
 * @returns The normalized domain, or `null` if the input is not a valid domain.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }

  const hasScheme = /^https?:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let host: string;
  try {
    host = new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host.startsWith('www.')) {
    host = host.slice(4);
  }

  if (!regexes.domain.test(host)) {
    return null;
  }

  return host;
}
