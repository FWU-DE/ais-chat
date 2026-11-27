import type OpenAI from 'openai';

import { AiGenerationError } from '../../errors';
import type { Message, StreamEvent, TokenUsage, ToolCall, ToolDefinition } from '../types';
import { estimateTokenUsage, isAbortError, toOpenAIResponsesInput, toOpenAITools } from '../utils';

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
  getUsageInfo?: (headers: Headers) => UsageInfo | Promise<UsageInfo>;
};

type UsageInfo = {
  modelId?: string;
  /** The real upstream provider that served the request, when the provider reports it. */
  provider?: string;
  /** The real upstream model name that served the request, when the provider reports it. */
  modelName?: string;
};

type ToolCallAccumulator = {
  id: string;
  callId: string;
  name: string;
  arguments: string;
};

function createToolCallAccumulator(): ToolCallAccumulator {
  return { id: '', callId: '', name: '', arguments: '' };
}

function applyFunctionCallItem(
  toolCall: ToolCallAccumulator,
  item: OpenAI.Responses.ResponseFunctionToolCall,
) {
  toolCall.id = item.id ?? item.call_id;
  toolCall.callId = item.call_id;
  toolCall.name = item.name;
  toolCall.arguments = item.arguments;
}

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
  getUsageInfo,
}: OpenAICompatibleAgenticStreamArgs): AsyncGenerator<StreamEvent> {
  const { data: stream, response: httpResponse } = await client.responses
    .create(
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
    )
    .withResponse();
  const usageInfo = (await getUsageInfo?.(httpResponse.headers)) ?? {};

  let content = '';
  let usage: TokenUsage | undefined;
  const toolCalls = new Map<number, ToolCallAccumulator>();
  let completedFunctionCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'response.output_text.delta') {
        content += chunk.delta;
        yield { type: 'text', delta: chunk.delta };
      } else if (chunk.type === 'response.reasoning_summary_text.delta') {
        yield {
          type: 'reasoning_summary',
          delta: chunk.delta,
          part: { itemId: chunk.item_id, summaryIndex: chunk.summary_index },
        };
      } else if (chunk.type === 'response.function_call_arguments.delta') {
        const existingToolCall = toolCalls.get(chunk.output_index) ?? createToolCallAccumulator();

        existingToolCall.arguments += chunk.delta;
        toolCalls.set(chunk.output_index, existingToolCall);
      } else if (chunk.type === 'response.function_call_arguments.done') {
        const existingToolCall = toolCalls.get(chunk.output_index) ?? createToolCallAccumulator();

        existingToolCall.arguments = chunk.arguments;
        toolCalls.set(chunk.output_index, existingToolCall);
      } else if (
        chunk.type === 'response.output_item.added' &&
        chunk.item.type === 'function_call'
      ) {
        // Calls without arguments (e.g. Llama) may never emit argument or done events.
        const existingToolCall = toolCalls.get(chunk.output_index) ?? createToolCallAccumulator();
        const streamedArguments = existingToolCall.arguments;

        applyFunctionCallItem(existingToolCall, chunk.item);
        existingToolCall.arguments = streamedArguments || chunk.item.arguments;
        toolCalls.set(chunk.output_index, existingToolCall);
      } else if (
        chunk.type === 'response.output_item.done' &&
        chunk.item.type === 'function_call'
      ) {
        const existingToolCall = toolCalls.get(chunk.output_index) ?? createToolCallAccumulator();

        applyFunctionCallItem(existingToolCall, chunk.item);
        toolCalls.set(chunk.output_index, existingToolCall);
      } else if (
        chunk.type === 'response.completed' ||
        chunk.type === 'response.incomplete' ||
        chunk.type === 'response.failed'
      ) {
        completedFunctionCalls = (chunk.response.output ?? []).filter(
          (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
            item.type === 'function_call',
        );

        if (chunk.response.usage) {
          usage = {
            completionTokens: chunk.response.usage.output_tokens,
            promptTokens: chunk.response.usage.input_tokens,
            totalTokens: chunk.response.usage.total_tokens,
          };
        }
      }
    }
  } catch (error) {
    if (!isAbortError(error, abortSignal)) {
      throw error;
    }

    // Partial tool calls are unusable, but the prompt was consumed upstream and still costs money.
    yield {
      type: 'finish',
      usage: usage ?? estimateTokenUsage({ messages, text: content }),
      ...(usageInfo.modelId ? { modelId: usageInfo.modelId } : {}),
      ...(usageInfo.provider ? { provider: usageInfo.provider } : {}),
      ...(usageInfo.modelName ? { modelName: usageInfo.modelName } : {}),
    };
    return;
  }

  // The completed response is the final state of every call. It updates calls already seen in
  // item events and adds calls that were only reported there, without any item events.
  for (const item of completedFunctionCalls) {
    const knownToolCall = [...toolCalls.values()].find(
      ({ id, callId }) =>
        (id && (id === item.id || id === item.call_id)) ||
        (callId && (callId === item.call_id || callId === item.id)),
    );

    if (knownToolCall) {
      applyFunctionCallItem(knownToolCall, item);
    } else {
      const toolCall = createToolCallAccumulator();
      applyFunctionCallItem(toolCall, item);
      toolCalls.set(Math.max(-1, ...toolCalls.keys()) + 1, toolCall);
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

  yield {
    type: 'finish',
    usage,
    ...(usageInfo.modelId ? { modelId: usageInfo.modelId } : {}),
    ...(usageInfo.provider ? { provider: usageInfo.provider } : {}),
    ...(usageInfo.modelName ? { modelName: usageInfo.modelName } : {}),
  };
}
