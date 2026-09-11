import { getEncoding, type Tiktoken } from 'js-tiktoken';
import type OpenAI from 'openai';
import type { Message, TokenUsage, ToolDefinition } from './types';

/**
 * Converts internal Message format to OpenAI ChatCompletionMessageParam format.
 * Handles image attachments by converting them to multimodal content arrays.
 */
export function toOpenAIMessages(
  messages: Message[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new Error('Tool messages require toolCallId');
      }

      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
      } satisfies OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
    }

    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      } satisfies OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
    }

    // If message has image attachments, convert to multimodal content format
    if (message.role === 'user' && message.attachments && message.attachments.length > 0) {
      const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: message.content },
        ...message.attachments
          .filter((attachment) => attachment.type === 'image')
          .map(
            (attachment) =>
              ({
                type: 'image_url',
                image_url: { url: attachment.url },
              }) satisfies OpenAI.Chat.Completions.ChatCompletionContentPartImage,
          ),
      ];

      return {
        role: 'user',
        content: contentParts,
      } satisfies OpenAI.Chat.Completions.ChatCompletionUserMessageParam;
    }

    // Simple text message
    return {
      role: message.role,
      content: message.content,
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  });
}

/**
 * Converts internal Message format to OpenAI Responses API input format.
 * Handles image attachments by converting them to multimodal content arrays.
 */
export function toOpenAIResponsesInput(messages: Message[]): OpenAI.Responses.ResponseInputItem[] {
  return messages.flatMap((message): OpenAI.Responses.ResponseInputItem[] => {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        throw new Error('Tool messages require toolCallId');
      }

      return [
        {
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: message.content,
          status: 'completed',
        } satisfies OpenAI.Responses.ResponseInputItem.FunctionCallOutput,
      ];
    }
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const result: OpenAI.Responses.ResponseInputItem[] = message.toolCalls.map(
        (toolCall) =>
          ({
            type: 'function_call',
            status: 'completed',
            arguments: toolCall.arguments,
            call_id: toolCall.id,
            name: toolCall.name,
          }) satisfies OpenAI.Responses.ResponseFunctionToolCall,
      );
      if (message.content) {
        result.unshift({
          role: message.role,
          content: message.content,
        } satisfies OpenAI.Responses.EasyInputMessage);
      }
      return result;
    }

    // If message has image attachments, convert to multimodal content format
    if (message.role !== 'system' && message.attachments && message.attachments.length > 0) {
      const contentParts: OpenAI.Responses.ResponseInputContent[] = [
        { type: 'input_text', text: message.content },
        ...message.attachments
          .filter((attachment) => attachment.type === 'image')
          .map(
            (attachment) =>
              ({
                type: 'input_image',
                image_url: attachment.url,
                detail: 'auto',
              }) satisfies OpenAI.Responses.ResponseInputImageContent,
          ),
      ];

      return [
        {
          role: message.role as 'user' | 'assistant' | 'system',
          content: contentParts,
        } satisfies OpenAI.Responses.EasyInputMessage,
      ];
    }

    // Simple text message
    return [
      {
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content,
      } satisfies OpenAI.Responses.EasyInputMessage,
    ];
  });
}

export function toOpenAITools(
  tools: ToolDefinition[] | undefined,
): OpenAI.Responses.Tool[] | undefined {
  if (!tools) return undefined;

  return tools.map((tool) => {
    return {
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: true, // Always recommended: https://developers.openai.com/api/docs/guides/function-calling#strict-mode
    } satisfies OpenAI.Responses.FunctionTool;
  });
}

export function toOpenAIChatTools(
  tools: ToolDefinition[] | undefined,
): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  if (!tools) return undefined;

  return tools.map((tool) => {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        strict: true,
      },
    } satisfies OpenAI.Chat.Completions.ChatCompletionTool;
  });
}

// Lazy-loaded encoder instance (cl100k_base is used for GPT-4, GPT-3.5-turbo, and newer models)
let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding('cl100k_base');
  }
  return encoder;
}

/**
 * Counts tokens in text using the cl100k_base encoding.
 *
 * @param text - The text to count tokens for.
 * @returns Token count.
 */
export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Calculates token usage for a chat completion.
 * Uses tiktoken with cl100k_base encoding for accurate token counting.
 * Only needed because IONOS does not return token usage in their streaming API responses.
 *
 * @param messages - An array of Message objects used as the prompt.
 * @param modelMessage - The final message returned by the model.
 * @returns An object containing token counts.
 */
export function calculateCompletionUsage({
  messages,
  modelMessage,
}: {
  messages: Message[];
  modelMessage: { role: 'assistant'; content: string };
}): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
  // Count tokens for all prompt messages
  // Note: This is a simplified calculation. The OpenAI api adds overhead tokens for message formatting
  // (roughly 3-4 tokens per message for role markers, etc.)
  // This can vary by model and provider and may change over time.
  const promptTokens = messages.reduce((total, message) => {
    return total + countTokens(message.content) + 4; // +4 for message overhead
  }, 3); // +3 for reply priming

  const completionTokens = modelMessage.content !== '' ? countTokens(modelMessage.content) : 0;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

/**
 * Usage for a generation that ended before the provider reported real numbers, e.g. an abort.
 * The prompt was already consumed upstream, so the cost is estimated rather than dropped.
 */
export function estimateTokenUsage({
  messages,
  text,
}: {
  messages: Message[];
  text: string;
}): TokenUsage {
  const usage = calculateCompletionUsage({
    messages,
    modelMessage: { role: 'assistant', content: text },
  });

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    estimated: true,
  };
}

/**
 * Returns true only for provider errors caused by the supplied abort signal.
 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (!signal?.aborted) {
    return false;
  }

  if (error === signal.reason) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode = 'code' in error ? error.code : undefined;
  return (
    error.name === 'AbortError' || error.name === 'APIUserAbortError' || errorCode === 'ABORT_ERR'
  );
}
