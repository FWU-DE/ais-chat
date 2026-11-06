import { env } from '@shared/valkey/env';
import { createStorage } from 'unstorage';
import redisDriver, { RedisOptions } from 'unstorage/drivers/redis';

// 1 second timeout to ensure AIS.chat remains available even if valkey is unreachable
const COMMAND_TIMEOUT_MS = 1_000;
const BASE_KEY_PREFIX = 'ais-chat:app';

function getClusterDriverOptions(valkeyUrl: string): RedisOptions {
  const url = new URL(valkeyUrl);
  return {
    cluster: [
      // Only the entry node is needed; ioredis discovers the rest of the cluster via CLUSTER SLOTS.
      { host: url.hostname, port: Number(url.port) || 6379 },
    ],
    clusterOptions: {
      // Disable the offline queue so commands fail fast instead of waiting indefinitely when the cluster is unreachable.
      enableOfflineQueue: false,
      redisOptions: {
        username: url.username ? decodeURIComponent(url.username) : undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        // rediss:// enables TLS for the connection to each cluster node
        tls: url.protocol === 'rediss:' ? {} : undefined,
        commandTimeout: COMMAND_TIMEOUT_MS,
      },
    },
    base: BASE_KEY_PREFIX,
  };
}

export const valkey = createStorage({
  driver: redisDriver(
    env.valkeyMode === 'cluster'
      ? getClusterDriverOptions(env.valkeyUrl)
      : {
          url: env.valkeyUrl,
          base: BASE_KEY_PREFIX,
          commandTimeout: COMMAND_TIMEOUT_MS,
        },
  ),
});
