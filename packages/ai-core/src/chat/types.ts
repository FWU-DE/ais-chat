import type { LlmModel } from '@ais-chat/api-database';

export const CONVERSATION_ROLES = ['system', 'user', 'assistant', 'tool'] as const;
export type ConversationRole = (typeof CONVERSATION_ROLES)[number];

/**
 * Attachment type in messages.
 * We only support images for now.
 */
export type ChatAttachment = ChatImageAttachment;

/**
 * An image attachment in a chat message.
 * Url is a public link to the image or a base64-encoded data URL.
 */
export type ChatImageAttachment = {
  contentType: string;
  url: string;
  type: 'image';
};

export function isChatImageAttachment(
  attachment: ChatAttachment,
): attachment is ChatImageAttachment {
  return attachment.type === 'image';
}

/**
 * A tool call requested by the assistant.
 */
export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

/**
 * Defines a tool that can be invoked by the model.
 */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** Reports the cost of an LLM call a tool makes internally, so it is billed to the user like any other model usage. */
export type ReportToolUsage = (
  modelId: string,
  usage: TokenUsage,
  priceInCents: number,
  /** The real upstream provider that served the request (e.g. as reported by Bifrost). */
  provider: string,
  /** The real upstream model name that served the request (e.g. as reported by Bifrost). */
  modelName: string,
) => void;

export type ToolHandlerOptions = {
  abortSignal?: AbortSignal;
  reportUsage?: ReportToolUsage;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  options?: ToolHandlerOptions,
) => Promise<unknown>;

export type ToolRegistryEntry = {
  definition: ToolDefinition;
  handler: ToolHandler;
};

export type ToolRegistry = Record<string, ToolRegistryEntry>;

export type Message = {
  role: ConversationRole;
  content: string;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
};

export type GenerationOptions = {
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  /** Aborts the upstream provider request so a stalled stream cannot be retained indefinitely. */
  abortSignal?: AbortSignal;
  /** Resolved server-side models used only by the Bifrost provider. */
  fallbackModels?: AiModel[];
};

export type TextGenerationArgs = {
  messages: Message[];
  model: string;
  /** Resolved server-side models used only by the Bifrost provider. */
  fallbackModels?: AiModel[];
} & GenerationOptions;

export type TokenUsage = {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
  /** Set when the provider never reported usage and the numbers were derived locally. */
  estimated?: boolean;
};

export type ModelSelection = {
  modelIds: readonly [string, ...string[]];
  modelName: string;
  onModelUsed?: (modelId: string) => void | Promise<void>;
};

/** Usage billed to a single model during an agentic turn, including the real upstream provider/model that served it. */
export type ModelUsage = {
  modelId: string;
  usage: TokenUsage;
  priceInCents: number;
  provider: string;
  modelName: string;
};

export type TextResponse = {
  text: string;
  usage: TokenUsage;
  modelId?: string;
  /** The real upstream provider that served the request (e.g. as reported by Bifrost). */
  provider?: string;
  /** The real upstream model name that served the request (e.g. as reported by Bifrost). */
  modelName?: string;
};

/**
 * Events yielded by the agentic stream.
 */
export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning_summary'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | {
      type: 'finish';
      usage: TokenUsage;
      modelId?: string;
      /** The real upstream provider that served the request (e.g. as reported by Bifrost). */
      provider?: string;
      /** The real upstream model name that served the request (e.g. as reported by Bifrost). */
      modelName?: string;
    };

export type TextGenerationFn = (args: TextGenerationArgs) => Promise<TextResponse>;

export type TextStreamFn = (
  args: TextGenerationArgs,
  onComplete?: (usage: TokenUsage, modelId?: string) => void | Promise<void>,
) => AsyncGenerator<string>;

export type AgenticStreamFn = (args: TextGenerationArgs) => AsyncGenerator<StreamEvent>;

// TODO: Just an alias for now, since the llmModel table needs renaming (it has image and embedding models too)
export type AiModel = LlmModel;
