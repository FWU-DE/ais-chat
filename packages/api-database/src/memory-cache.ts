import * as Sentry from '@sentry/core';
import { Cache, MutationOption } from 'drizzle-orm/cache/core';
import { CacheConfig } from 'drizzle-orm/cache/core/types';
import { entityKind } from 'drizzle-orm/entity';

/**
 * A drizzle cache provider for caching values in memory.
 * This provider should only be used for infrequently updated tables,
 * where eventual consistency is sufficient.
 *
 * Note:
 * - This provider supports only the expiry time, see `CacheConfig.ex` and `CacheConfig.px`
 * - It does not support auto-invalidation on db updates, as invalidation of
 *   local caches in a horizontally scaled application does not provide any benefit
 */
export class MemoryCache extends Cache {
  static override readonly [entityKind]: string = 'MemoryCache';

  private readonly ttlSeconds: number;

  private readonly cache = new Map<
    string,
    {
      expireTimestamp: number;
      value: unknown;
    }
  >();

  constructor(
    config: Required<Pick<CacheConfig, 'ex'>>,
    private readonly useGlobally?: boolean,
  ) {
    super();
    this.ttlSeconds = config.ex;
  }

  public strategy() {
    return this.useGlobally ? 'all' : 'explicit';
  }

  override get(key: string): Promise<unknown[] | undefined> {
    const result = Sentry.startSpan(
      {
        name: 'Fetching cached db query',
        attributes: { 'cache.key': [key] },
        op: 'cache.get',
      },
      (span): unknown[] | undefined => {
        let entry = this.cache.get(key);
        const now = new Date().getTime();
        if (entry && entry.expireTimestamp < now) {
          this.cache.delete(key);
          entry = undefined;
        }

        if (entry && entry.value) {
          span.setAttribute('cache.hit', true);
          return entry.value as unknown[];
        }

        span.setAttribute('cache.hit', false);
        return undefined;
      },
    );

    return Promise.resolve(result);
  }

  override put(
    key: string,
    response: unknown,
    tables: string[],
    isTag: boolean,
    config?: CacheConfig,
  ): Promise<void> {
    const ttlMilliseconds = config?.px ?? (config?.ex ? config.ex : this.ttlSeconds) * 1000;
    const now = new Date().getTime();

    const expireTimestamp = now + ttlMilliseconds;

    Sentry.startSpan(
      {
        name: 'Caching db query',
        attributes: {
          'cache.key': [key],
          'cache.ttl': Math.floor(ttlMilliseconds / 1000),
        },
        op: 'cache.put',
      },
      () => {
        this.cache.set(key, { value: response, expireTimestamp });
      },
    );
    return Promise.resolve();
  }

  override onMutate(params: MutationOption): Promise<void> {
    const tags: string[] = Array.isArray(params.tags)
      ? params.tags
      : params.tags
        ? [params.tags]
        : [];

    Sentry.startSpan(
      {
        name: 'Removing cached db queries',
        attributes: { 'cache.key': tags },
        op: 'cache.remove',
      },
      () => {
        tags.forEach((tag) => this.cache.delete(tag));
      },
    );
    return Promise.resolve();
  }
}
