export type BifrostProvider = 'azure' | 'openai' | 'vertex' | 'ionos';

export const BIFROST_PROVIDERS: BifrostProvider[] = ['azure', 'openai', 'vertex', 'ionos'];

export type BifrostSecret =
  | string
  | {
      value: string;
      env_var?: string;
      from_env?: boolean;
    };

export type BifrostKey = {
  id?: string;
  name: string;
  value: BifrostSecret;
  models: string[];
  weight: number;
  aliases?: Record<string, string>;
  azure_key_config?: {
    endpoint: BifrostSecret;
  };
  vertex_key_config?: {
    project_id: BifrostSecret;
    region: BifrostSecret;
    auth_credentials?: BifrostSecret;
  };
  enabled?: boolean;
};

export type BifrostProviderConfig = {
  provider: BifrostProvider;
  network_config?: {
    base_url?: string;
    allow_private_network?: boolean;
  };
  custom_provider_config?: {
    base_provider_type: 'openai';
    // Bifrost custom provider request types:
    // https://docs.getbifrost.ai/providers/custom-providers#allowed-request-types
    // Bifrost's officially supported provider endpoint matrix:
    // https://docs.getbifrost.ai/providers/supported-providers/overview
    allowed_requests: {
      list_models: boolean;
      chat_completion: boolean;
      chat_completion_stream: boolean;
      embedding: boolean;
      image_generation: boolean;
    };
  };
  keys: BifrostKey[];
};

export type BifrostProviderConfigFields = Omit<BifrostProviderConfig, 'provider' | 'keys'>;

export type BifrostProviderResponse = Omit<BifrostProviderConfig, 'provider' | 'keys'> & {
  name?: string;
  concurrency_and_buffer_size?: {
    concurrency?: number;
    buffer_size?: number;
  };
  proxy_config?: Record<string, unknown>;
  send_back_raw_request?: boolean;
  send_back_raw_response?: boolean;
  store_raw_request_response?: boolean;
};

export type BifrostProviderSyncLogger = {
  info?: (message: string, context?: Record<string, unknown>) => void;
  warning?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, error?: unknown, context?: Record<string, unknown>) => void;
};

export type BifrostProviderSyncOptions = {
  bifrostAdminUrl?: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  logger?: BifrostProviderSyncLogger;
};

/**
 * Provider access configuration for a Bifrost virtual key.
 *
 * `provider` is a plain string (not `BifrostProvider`) because virtual keys read from Bifrost
 * may include provider configs for providers outside `BIFROST_PROVIDERS`, which this codebase
 * leaves untouched here. `budgets` and `rate_limit` are treated as opaque - we only ever read
 * and re-send them unchanged for provider configs we didn't add ourselves.
 */
export type BifrostVirtualKeyProviderConfig = {
  id?: number;
  provider: string;
  allowed_models: string[];
  blacklisted_models?: string[];
  key_ids?: string[];
  weight?: number | null;
  budgets?: unknown[];
  rate_limit?: unknown;
};

export type BifrostVirtualKey = {
  id: string;
  provider_configs: BifrostVirtualKeyProviderConfig[];
};
