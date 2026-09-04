import { instrumentOpenAiClient } from '@sentry/core';
import OpenAI from 'openai';
import type {
  AgenticStreamFn,
  AiModel,
  ToolCall,
  TextGenerationFn,
  TextStreamFn,
  TokenUsage,
} from '../types';
import { ProviderConfigurationError } from '../../errors';
import { calculateCompletionUsage, toOpenAIChatTools, toOpenAIMessages } from '../utils';

function createIonosClient(model: AiModel): OpenAI {
  if (model.setting.provider !== 'ionos') {
    throw new ProviderConfigurationError('Invalid model configuration for IONOS');
  }

  return instrumentOpenAiClient(
    new OpenAI({
      apiKey: model.setting.apiKey,
      baseURL: model.setting.baseUrl,
    }),
  );
}

export function constructIonosTextStreamFn(model: AiModel): TextStreamFn {
  const client = createIonosClient(model);

  return async function* getIonosTextStream(
    { messages, model: modelName, maxTokens, temperature },
    onComplete,
  ) {
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: toOpenAIMessages(messages),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens,
      temperature,
    });

    let content = '';

    for await (const chunk of stream) {
      const chunkContent = chunk.choices[0]?.delta?.content;

      if (chunkContent) {
        content += chunkContent;
        yield chunkContent;
      }
    }

    // Calculate the token usage manually as IONOS does not return it
    // TODO: Add token count for image inputs
    // See: https://platform.openai.com/docs/guides/images-vision?api-mode=responses&format=file
    const calculatedUsage = calculateCompletionUsage({
      messages,
      modelMessage: { role: 'assistant', content },
    });

    const usage: TokenUsage = {
      completionTokens: calculatedUsage.completion_tokens,
      promptTokens: calculatedUsage.prompt_tokens,
      totalTokens: calculatedUsage.total_tokens,
    };

    if (onComplete) {
      await onComplete(usage);
    }
  };
}

export function constructIonosTextGenerationFn(model: AiModel): TextGenerationFn {
  const client = createIonosClient(model);

  return async function getIonosTextGeneration({
    messages,
    model: modelName,
    maxTokens,
    temperature,
  }) {
    const response = await client.chat.completions.create({
      model: modelName,
      messages: toOpenAIMessages(messages),
      stream: false,
      max_tokens: maxTokens,
      temperature,
    });

    const text = response.choices[0]?.message?.content ?? '';

    // Calculate the token usage manually as IONOS does not return it reliably
    const calculatedUsage = calculateCompletionUsage({
      messages,
      modelMessage: { role: 'assistant', content: text },
    });

    return {
      text,
      usage: {
        completionTokens: calculatedUsage.completion_tokens,
        promptTokens: calculatedUsage.prompt_tokens,
        totalTokens: calculatedUsage.total_tokens,
      },
    };
  };
}

export function constructIonosAgenticStreamFn(model: AiModel): AgenticStreamFn {
  const client = createIonosClient(model);

  return async function* getIonosAgenticTextStream({
    messages,
    model: modelName,
    maxTokens,
    temperature,
    tools,
    toolChoice,
    abortSignal,
  }) {
    const stream = await client.chat.completions.create(
      {
        model: modelName,
        messages: toOpenAIMessages(messages),
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokens,
        temperature,
        tools: toOpenAIChatTools(tools),
        tool_choice: toolChoice,
      },
      { signal: abortSignal },
    );

    type ToolCallAccumulator = {
      id: string;
      name: string;
      arguments: string;
    };

    let content = '';
    let usage: TokenUsage | undefined;
    const toolCalls = new Map<number, ToolCallAccumulator>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const chunkContent = delta?.content;

      if (chunkContent) {
        content += chunkContent;
        yield { type: 'text', delta: chunkContent };
      }

      if (chunk.usage) {
        usage = {
          completionTokens: chunk.usage.completion_tokens,
          promptTokens: chunk.usage.prompt_tokens,
          totalTokens: chunk.usage.total_tokens,
        };
      }

      if (!delta?.tool_calls) {
        continue;
      }

      for (const toolCallDelta of delta.tool_calls) {
        const existingToolCall = toolCalls.get(toolCallDelta.index) ?? {
          id: '',
          name: '',
          arguments: '',
        };

        if (toolCallDelta.id) {
          existingToolCall.id = toolCallDelta.id;
        }

        if (toolCallDelta.function?.name) {
          existingToolCall.name = toolCallDelta.function.name;
        }

        if (toolCallDelta.function?.arguments) {
          existingToolCall.arguments += toolCallDelta.function.arguments;
        }

        toolCalls.set(toolCallDelta.index, existingToolCall);
      }
    }

    const resolvedToolCalls: ToolCall[] = [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .filter(([, toolCall]) => toolCall.id && toolCall.name)
      .map(([, toolCall]) => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: toolCall.arguments,
      }));

    if (!usage) {
      const completionContent = [
        content,
        ...resolvedToolCalls.map((toolCall) =>
          JSON.stringify({ name: toolCall.name, arguments: toolCall.arguments }),
        ),
      ].join('');

      const calculatedUsage = calculateCompletionUsage({
        messages,
        modelMessage: { role: 'assistant', content: completionContent },
      });

      usage = {
        completionTokens: calculatedUsage.completion_tokens,
        promptTokens: calculatedUsage.prompt_tokens,
        totalTokens: calculatedUsage.total_tokens,
      };
    }

    for (const toolCall of resolvedToolCalls) {
      yield { type: 'tool_call', call: toolCall };
    }

    yield { type: 'finish', usage };
  };
}
