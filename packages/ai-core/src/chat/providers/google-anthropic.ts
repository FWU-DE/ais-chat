import type {
  Base64ImageSource,
  ContentBlockParam,
  ImageBlockParam,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  MessageParam,
  StopReason,
  ToolChoice,
  ToolResultBlockParam,
  ToolUnion,
  ToolUseBlockParam,
  Usage,
} from '@anthropic-ai/sdk/resources';
import {
  AgenticStreamFn,
  AiModel,
  ChatAttachment,
  Message,
  StreamEvent,
  TextGenerationArgs,
  TextGenerationFn,
  TextResponse,
  TextStreamFn,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from '../types';
import { AnthropicVertex, ClientOptions } from '@anthropic-ai/vertex-sdk';
import { AiGenerationError, RateLimitExceededError } from '../../errors';
import { ParsedMessage } from '@anthropic-ai/sdk';
import { instrumentAnthropicAiClient } from '@sentry/core';

/* used by apps/api when called with stream === false or as auxiliary model in chat-bot */
export function constructGoogleAnthropicTextGenerationFn(model: AiModel): TextGenerationFn {
  const config = getConfigurationByModel(model);
  const client = createAnthropicClient(config);

  return async function generateText({
    messages,
    maxTokens,
    model: modelName,
  }: TextGenerationArgs): Promise<TextResponse> {
    // Separate system messages from conversation messages
    const systemMessages = getSystemMessages(messages);
    // Filter out tool messages for non-agentic text generation
    const conversationMessages = getNonSystemMessages(messages)
      .filter((msg) => msg.role !== 'tool')
      .map((msg) => mapMessageToAnthropicMessageParam(msg));

    const vertexModelName = resolveModelName(modelName);

    const messageParams: MessageCreateParamsNonStreaming = {
      max_tokens: maxTokens ?? 4096,
      messages: conversationMessages,
      model: vertexModelName,
      stream: false,
      system: buildSystemPrompt(systemMessages),
    };

    const response = await client.messages.create(messageParams);

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return {
      text,
      usage: buildTokenUsage(response.usage),
    };
  };
}

/**
 * used by api and chat-bot for streaming text responses
 * Note: Images are supported at the moment but require special handling.
 * They needed to be uploaded separately or included as base64 encoded content in the message.
 */
export function constructGoogleAnthropicTextStreamFn(model: AiModel): TextStreamFn {
  const config = getConfigurationByModel(model);
  const client = createAnthropicClient(config);

  return async function* generateTextStream(
    args: TextGenerationArgs,
    onComplete?: (usage: TokenUsage) => void | Promise<void>,
  ): AsyncGenerator<string> {
    try {
      const { messages, maxTokens, model: modelName } = args;

      // Separate system messages from conversation messages
      const systemMessages = getSystemMessages(messages);
      // Filter out tool messages for non-agentic text streaming
      const conversationMessages = getNonSystemMessages(messages)
        .filter((msg) => msg.role !== 'tool')
        .map((msg) => mapMessageToAnthropicMessageParam(msg));

      const vertexModelName = resolveModelName(modelName);

      const messageParams: MessageCreateParamsStreaming = {
        max_tokens: maxTokens ?? 4096,
        messages: conversationMessages,
        model: vertexModelName,
        stream: true,
        system: buildSystemPrompt(systemMessages),
      };

      const stream = client.messages.stream(messageParams);

      let usage: TokenUsage | undefined = undefined;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        } else if (event.type === 'message_stop') {
          const message = await stream.finalMessage();
          if (message.usage) {
            usage = buildTokenUsage(message.usage);
          }
        }
      }

      if (onComplete && usage) {
        await onComplete(usage);
      }
    } catch (error) {
      handleError(error);
    }
  };
}

/**
 *  used by chat-bot for streaming agentic responses if activated
 */
export function constructGoogleAnthropicAgenticStreamFn(model: AiModel): AgenticStreamFn {
  const config = getConfigurationByModel(model);
  const client = createAnthropicClient(config);

  return async function* generateAgenticStream(
    args: TextGenerationArgs,
  ): AsyncGenerator<StreamEvent> {
    try {
      const { messages, maxTokens, model: modelName, tools, toolChoice, abortSignal } = args;
      const systemMessages = getSystemMessages(messages);
      const conversationMessages = groupToolResults(
        getNonSystemMessages(messages).map((msg) => mapMessageToAnthropicMessageParam(msg)),
      );
      const vertexModelName = resolveModelName(modelName);
      const messageParams: MessageCreateParamsStreaming = {
        max_tokens: maxTokens ?? 4096,
        messages: conversationMessages,
        model: vertexModelName,
        stream: true,
        system: buildSystemPrompt(systemMessages),
        tool_choice: mapToolChoiceToAnthropicToolChoice(toolChoice),
        tools: mapToolsToAnthropicTools(tools),
      };

      const stream = client.messages.stream(messageParams, { signal: abortSignal });

      // Track whether text was streamed as deltas to avoid duplication from finalMessage
      let hasStreamedTextDeltas = false;

      // The streaming response is a sequence of content block deltas and a final message at the end (message_stop).
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          hasStreamedTextDeltas = true;
          yield { type: 'text', delta: event.delta.text };
        } else if (event.type === 'message_stop') {
          const message: ParsedMessage<null> = await stream.finalMessage();
          const { content, usage, stop_reason } = message;

          ensureValidStopReason(stop_reason);

          for (const contentBlock of content) {
            if (contentBlock.type === 'tool_use') {
              // Yield tool calls
              yield {
                type: 'tool_call',
                call: {
                  id: contentBlock.id,
                  name: contentBlock.name,
                  arguments: JSON.stringify(contentBlock.input),
                } satisfies ToolCall,
              };
            } else if (contentBlock.type === 'text') {
              // Only yield text from finalMessage if it wasn't already streamed as deltas
              // (this can happen for very short responses that skip the streaming phase)
              if (!hasStreamedTextDeltas && contentBlock.text) {
                yield { type: 'text', delta: contentBlock.text };
              }
            }
          }

          // Yield usage at the end of the stream
          if (usage) {
            yield {
              type: 'finish',
              usage: buildTokenUsage(usage),
            };
          }
        }
      }
    } catch (error) {
      handleError(error);
    }
  };
}

function createAnthropicClient(options: ClientOptions): AnthropicVertex {
  return instrumentAnthropicAiClient(new AnthropicVertex(options));
}

/**
 * ProjectId and Region is mandatory and taken from model settings.
 * MaxRetries is set to 2 (which is also the default value).
 * Errors based on network connectivity, rate limit and internal server errors are automatically retried
 * Default Timeout is 10 minutes.
 * @param model
 * @returns
 */
function getConfigurationByModel(model: AiModel): ClientOptions {
  if (model.setting.provider !== 'google') {
    throw new Error('Invalid model configuration for Google Anthropic');
  }

  const { projectId, location } = model.setting;
  return { projectId, region: location, maxRetries: 2 };
}

type NonSystemMessage = Message & { role: 'user' | 'assistant' | 'tool' };

function getSystemMessages(messages: Message[]): Message[] {
  return messages.filter((msg) => msg.role === 'system');
}

function getNonSystemMessages(messages: Message[]): NonSystemMessage[] {
  return messages.filter((msg): msg is NonSystemMessage => msg.role !== 'system');
}

/**
 * Groups consecutive tool result messages into single user messages.
 * Anthropic API requires tool results to be in user messages, and consecutive
 * tool results should be grouped together in a single user message.
 */
function groupToolResults(messages: MessageParam[]): MessageParam[] {
  const result: MessageParam[] = [];
  let i = 0;

  while (i < messages.length) {
    const currentMessage = messages[i];
    if (!currentMessage) break;

    // Check if this is a user message containing tool results
    if (
      currentMessage.role === 'user' &&
      Array.isArray(currentMessage.content) &&
      currentMessage.content.some((block) => block.type === 'tool_result')
    ) {
      // Collect all consecutive user messages with tool results
      const toolResultBlocks: ToolResultBlockParam[] = [];
      let j = i;

      while (j < messages.length) {
        const msg = messages[j];
        if (!msg) break;

        if (
          msg.role === 'user' &&
          Array.isArray(msg.content) &&
          msg.content.some((block) => block.type === 'tool_result')
        ) {
          // Extract tool_result blocks
          const toolResults = msg.content.filter(
            (block): block is ToolResultBlockParam => block.type === 'tool_result',
          );
          toolResultBlocks.push(...toolResults);
          j++;
        } else {
          break;
        }
      }

      // Create a single user message with all tool results
      result.push({
        role: 'user',
        content: toolResultBlocks,
      });

      i = j;
    } else {
      // Not a tool result message, add as-is
      result.push(currentMessage);
      i++;
    }
  }

  return result;
}

/**
 * Handle errors from Google Anthropic API
 * Error codes: https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript#handling-errors
 * @param error
 */
function handleError(error: unknown) {
  // AiGenerationError are just re-thrown
  if (error instanceof AiGenerationError) {
    throw error;
  }
  // Special handling of RateLimitError
  if (error && typeof error === 'object' && 'status' in error && error['status'] === 429) {
    throw new RateLimitExceededError('Rate limit reached for Google Anthropic API');
  }
  // Try to get status code from error object to be more specific
  if (error && typeof error === 'object' && 'status' in error) {
    throw new AiGenerationError(
      'Error during text generation. Status code: ' + String(error['status']),
    );
  }
  throw new AiGenerationError('An error occurred during text generation.');
}

// Strip "anthropic/" prefix if present
function resolveModelName(modelName: string): string {
  return modelName.replace(/^anthropic\//, '');
}

function buildSystemPrompt(systemMessages: Message[]): string {
  return systemMessages.length > 0 ? systemMessages.map((msg) => msg.content).join('\n') : '';
}

/**
 * builds TokenUsage object from Anthropic usage data
 */
function buildTokenUsage(usage: Usage): TokenUsage {
  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: usage.input_tokens + usage.output_tokens,
  };
}

/**
 * Validates the stop reason.
 * Some stop reasons may result in an AiGenerationError,
 * others are considered as normal and some are ignored;
 */
function ensureValidStopReason(reason: StopReason | null) {
  if (reason === null) return; // it is null in message_start events
  if (reason === 'end_turn') return; // normal stop reason
  if (reason === 'tool_use') return; // normal tool use stop reason
  if (reason === 'max_tokens')
    throw new AiGenerationError('Max tokens reached during agentic generation');
  if (reason === 'refusal')
    throw new AiGenerationError('Model refused to generate a response during agentic generation');
}

/**
 * Checks if a tool result string represents an error.
 * Tries to parse it as JSON and checks for an "error" field with a non-null value.
 */
function isToolResultError(content: string): boolean {
  try {
    if (content.startsWith('Error:')) return true;

    const parsed = JSON.parse(content);
    // Check if the parsed object has an "error" field with a truthy value
    return parsed && typeof parsed === 'object' && 'error' in parsed && parsed.error !== null;
  } catch {
    // Not valid JSON, not an error response
    return false;
  }
}

/*** Mapping functions ****/

/**
 * Urls to images are not supported. There is a type called 'URLImageSource' but it throws an error when used.
 * Therefore the image data must be included as base64 encoded content in the message.
 * There is a second option to upload the image but in this case the data retention policy is not used --> not allowed.
 */
function mapMessageToAnthropicMessageParam(message: NonSystemMessage): MessageParam {
  const content: Array<ContentBlockParam> = [];

  if (message.role === 'user') {
    const contentBlocks: Array<ContentBlockParam> = [
      { type: 'text', text: message.content },
      ...(message.attachments?.filter(isImageAttachmentWithBase64DataUrl)?.map((attachment) => {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: sanitizeMediaType(attachment.contentType),
            data: sanitizeBase64DataUrl(attachment.url),
          },
        } as ImageBlockParam;
      }) ?? []),
    ];
    content.push(...contentBlocks);
  }

  if (message.role === 'assistant') {
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    if (message.toolCalls) {
      content.push(
        ...message.toolCalls.map((toolCall) => {
          return {
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: JSON.parse(toolCall.arguments),
          } as ToolUseBlockParam;
        }),
      );
    }
  }

  if (message.role === 'tool') {
    // Ensure tool result content is never empty - Anthropic API requires non-empty content
    const toolResultContent = message.content.trim() || 'No content returned';

    // Check if this is an error response (either starts with "Error:" or contains error in JSON)
    const isErrorResult = isToolResultError(toolResultContent);

    content.push({
      type: 'tool_result',
      tool_use_id: message.toolCallId ?? '',
      content: toolResultContent,
      is_error: isErrorResult,
    } as ToolResultBlockParam);
  }

  return {
    role: mapRoleToAntropic(message.role),
    content: content,
  };
}

/**
 * Maps ai-core message role to Anthropic message role.
 */
function mapRoleToAntropic(role: 'user' | 'assistant' | 'tool'): MessageParam['role'] {
  switch (role) {
    case 'tool':
    case 'user':
      return 'user';
    case 'assistant':
      return 'assistant';
  }
}

/**
 * Maps ai-core ToolDefinition[] to Anthropic ToolUnion[].
 */
function mapToolsToAnthropicTools(tools: ToolDefinition[] | undefined): ToolUnion[] | undefined {
  return tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      ...tool.parameters,
      type: 'object' as const,
    },
  }));
}

/**
 * Maps ai-core toolChoice to Anthropic tool_choice.
 */
function mapToolChoiceToAnthropicToolChoice(
  toolChoice: 'auto' | 'none' | 'required' | undefined,
): ToolChoice | undefined {
  switch (toolChoice) {
    // anthropic also provides 'tool' as an option
    // in this case the model must choose a specific tool instead of just any tool but we do not support that yet
    case 'auto':
      return { type: 'auto' as const };
    case 'none':
      return { type: 'none' as const };
    case 'required':
      return { type: 'any' as const }; // any means that the model must choose at least one tool
    default:
      return undefined;
  }
}

/**** Image support ****/

function isImageAttachmentWithBase64DataUrl(attachment: ChatAttachment): boolean {
  return attachment.type === 'image' && isBase64DataUrl(attachment.url);
}

function isBase64DataUrl(url: string): boolean {
  return url.startsWith('data:image/') && url.includes(';base64,');
}

/**
 * removes 'data:image/[image_type];base64,' prefix
 */
function sanitizeBase64DataUrl(base64DataUrl: string): string {
  if (!base64DataUrl.startsWith('data:image/')) {
    throw new AiGenerationError('Images are only supported via base64 encoded content data.');
  }
  const prefixPattern = /^data:image\/[a-zA-Z]+;base64,/;
  return base64DataUrl.replace(prefixPattern, '');
}

/**
 * image/jpg is not allowed and must be passed as image/jpeg.
 * Also checks for unsupported image formats and throws an error in this case.
 */
function sanitizeMediaType(contentType: string): Base64ImageSource['media_type'] {
  switch (contentType) {
    case 'image/jpg':
    case 'image/jpeg':
      return 'image/jpeg';
    case 'image/png':
      return 'image/png';
    case 'image/gif':
      return 'image/gif';
    case 'image/webp':
      return 'image/webp';
    default:
      throw new AiGenerationError(`Unsupported image content type: ${contentType}`);
  }
}
