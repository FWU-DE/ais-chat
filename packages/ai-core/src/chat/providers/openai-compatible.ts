import type OpenAI from 'openai';
import type { Message, StreamEvent, TokenUsage, ToolCall, ToolDefinition } from '../types';
import { AiGenerationError } from '../../errors';
import { toOpenAIResponsesInput, toOpenAITools } from '../utils';

type OpenAICompatibleAgenticStreamArgs = {
  client: OpenAI;
  messages: Message[];
  modelName: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  abortSignal?: AbortSignal;
  getUsage?: (result: { content: string; toolCalls: ToolCall[] }) => TokenUsage;
  providerName: string;
  createOptions?: Parameters<OpenAI['responses']['create']>[1];
  additionalParameters?: Record<string, unknown>;
  getModelId?: (extraFields: unknown) => string | undefined | Promise<string | undefined>;
};

type ToolCallAccumulator = {
  id: string;
  callId: string;
  name: string;
  arguments: string;
};

export async function* streamOpenAICompatibleAgenticResponse({
  client,
  messages,
  modelName,
  maxTokens,
  temperature,
  tools,
  toolChoice,
  abortSignal,
  getUsage,
  providerName,
  createOptions,
  additionalParameters,
  getModelId,
}: OpenAICompatibleAgenticStreamArgs): AsyncGenerator<StreamEvent> {
  const stream = await client.responses.create(
    {
      model: modelName,
      input: toOpenAIResponsesInput(messages),
      stream: true,
      max_output_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      tools: toOpenAITools(tools),
      tool_choice: toolChoice,
      ...additionalParameters,
    },
    { ...createOptions, ...(abortSignal ? { signal: abortSignal } : {}) },
  );

  let content = '';
  let usage: TokenUsage | undefined;
  let modelId: string | undefined;
  const toolCalls = new Map<number, ToolCallAccumulator>();

  for await (const chunk of stream) {
    if (chunk.type === 'response.output_text.delta') {
      content += chunk.delta;
      yield { type: 'text', delta: chunk.delta };
    } else if (chunk.type === 'response.function_call_arguments.delta') {
      const existingToolCall = toolCalls.get(chunk.output_index) ?? {
        id: '',
        callId: '',
        name: '',
        arguments: '',
      };

      existingToolCall.arguments += chunk.delta;
      toolCalls.set(chunk.output_index, existingToolCall);
    } else if (chunk.type === 'response.function_call_arguments.done') {
      const existingToolCall = toolCalls.get(chunk.output_index) ?? {
        id: '',
        callId: '',
        name: '',
        arguments: '',
      };

      existingToolCall.name = chunk.name;
      existingToolCall.arguments = chunk.arguments;
      toolCalls.set(chunk.output_index, existingToolCall);
    } else if (chunk.type === 'response.output_item.done' && chunk.item.type === 'function_call') {
      const existingToolCall = toolCalls.get(chunk.output_index) ?? {
        id: '',
        callId: '',
        name: '',
        arguments: '',
      };

      existingToolCall.id = chunk.item.id ?? chunk.item.call_id;
      existingToolCall.callId = chunk.item.call_id;
      existingToolCall.name = chunk.item.name;
      existingToolCall.arguments = chunk.item.arguments;
      toolCalls.set(chunk.output_index, existingToolCall);
    } else if (
      (chunk.type === 'response.completed' ||
        chunk.type === 'response.incomplete' ||
        chunk.type === 'response.failed') &&
      chunk.response.usage
    ) {
      usage = {
        completionTokens: chunk.response.usage.output_tokens,
        promptTokens: chunk.response.usage.input_tokens,
        totalTokens: chunk.response.usage.total_tokens,
      };
      modelId = await getModelId?.(
        (chunk.response as typeof chunk.response & { extra_fields?: unknown }).extra_fields,
      );
    }
  }

  const resolvedToolCalls: ToolCall[] = [];
  for (const [, toolCall] of [...toolCalls.entries()].sort(([left], [right]) => left - right)) {
    if ((!toolCall.callId && !toolCall.id) || !toolCall.name) {
      throw new AiGenerationError(`Incomplete tool call returned from ${providerName} stream`);
    }

    resolvedToolCalls.push({
      id: toolCall.callId || toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    });
  }

  if (!usage) {
    usage = getUsage?.({ content, toolCalls: resolvedToolCalls });
  }

  if (!usage) {
    throw new AiGenerationError(`No usage data returned from ${providerName} stream`);
  }

  for (const toolCall of resolvedToolCalls) {
    yield {
      type: 'tool_call',
      call: toolCall,
    };
  }

  yield { type: 'finish', usage, ...(modelId ? { modelId } : {}) };
}
