import {
  FinishReason,
  FunctionCallingConfigMode,
  createPartFromText,
  createPartFromUri,
} from '@google/genai';
import { randomUUID } from 'node:crypto';
import type {
  FunctionDeclaration,
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentResponsePromptFeedback,
  GenerateContentResponseUsageMetadata,
  Part,
  Tool,
  ToolConfig,
} from '@google/genai';
import type {
  AgenticStreamFn,
  AiModel,
  Message,
  TextGenerationFn,
  TextStreamFn,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from '../types';
import { AiGenerationError, ResponsibleAIError } from '../../errors';
import { createGoogleClient, formatGoogleError } from '../../google-client';
import { calculateCompletionUsage } from '../utils';
import {
  constructGoogleAnthropicAgenticStreamFn,
  constructGoogleAnthropicTextGenerationFn,
  constructGoogleAnthropicTextStreamFn,
} from './google-anthropic';

const RESPONSIBLE_AI_FINISH_REASONS = new Set<FinishReason>([
  FinishReason.SAFETY,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
]);

function buildGoogleParts(message: Message): Part[] {
  const parts: Part[] = [];

  if (message.content !== '') {
    parts.push(createPartFromText(message.content));
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.type !== 'image') {
      continue;
    }

    parts.push(createPartFromUri(attachment.url, attachment.contentType));
  }

  if (parts.length === 0) {
    parts.push(createPartFromText(''));
  }

  return parts;
}

function buildGoogleGenerateContentParameters({
  messages,
  model,
  maxTokens,
  temperature,
  tools,
  toolChoice,
  abortSignal,
}: Parameters<TextGenerationFn>[0]): GenerateContentParameters {
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: buildGoogleParts(message),
    }));
  const systemInstruction = messages
    .filter((message) => message.role === 'system' && message.content !== '')
    .map((message) => createPartFromText(message.content));
  const config = {
    ...(systemInstruction.length > 0 ? { systemInstruction } : {}),
    ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(abortSignal !== undefined ? { abortSignal } : {}),
    ...buildGoogleToolConfig(tools, toolChoice),
  };

  return {
    model,
    contents: contents.length > 0 ? contents : [{ role: 'user', parts: [createPartFromText('')] }],
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
}

function toGoogleFunctionDeclarations(
  tools: ToolDefinition[] | undefined,
): FunctionDeclaration[] | undefined {
  if (!tools) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function buildGoogleToolConfig(
  tools: ToolDefinition[] | undefined,
  toolChoice: 'auto' | 'none' | 'required' | undefined,
): { tools?: Tool[]; toolConfig?: ToolConfig } {
  const functionDeclarations = toGoogleFunctionDeclarations(tools);
  const googleTools = functionDeclarations ? [{ functionDeclarations }] : undefined;

  if (!toolChoice && !googleTools) {
    return {};
  }

  const functionCallingConfig =
    toolChoice === 'none'
      ? { mode: FunctionCallingConfigMode.NONE }
      : toolChoice === 'required'
        ? {
            mode: FunctionCallingConfigMode.ANY,
            ...(functionDeclarations && functionDeclarations.length > 0
              ? {
                  allowedFunctionNames: functionDeclarations
                    .map((tool) => tool.name)
                    .filter(Boolean) as string[],
                }
              : {}),
          }
        : toolChoice === 'auto'
          ? { mode: FunctionCallingConfigMode.AUTO }
          : undefined;

  return {
    ...(googleTools ? { tools: googleTools } : {}),
    ...(functionCallingConfig ? { toolConfig: { functionCallingConfig } } : {}),
  };
}

function getResponsibleAiMessage({
  promptFeedback,
  finishReason,
}: {
  promptFeedback?: GenerateContentResponsePromptFeedback;
  finishReason?: FinishReason;
}): string | undefined {
  if (promptFeedback?.blockReasonMessage) {
    return promptFeedback.blockReasonMessage;
  }

  if (promptFeedback?.blockReason) {
    return `Google Vertex AI blocked the prompt: ${promptFeedback.blockReason}`;
  }

  if (finishReason && RESPONSIBLE_AI_FINISH_REASONS.has(finishReason)) {
    return `Google Vertex AI blocked the response: ${finishReason}`;
  }

  return undefined;
}

function assertGoogleResponseAllowed(response: GenerateContentResponse): void {
  const finishReason = response.candidates?.[0]?.finishReason;
  const errorMessage = getResponsibleAiMessage({
    promptFeedback: response.promptFeedback,
    finishReason,
  });

  if (errorMessage) {
    throw new ResponsibleAIError(errorMessage);
  }
}

function toTokenUsage({
  usageMetadata,
  messages,
  text,
}: {
  usageMetadata?: GenerateContentResponseUsageMetadata;
  messages: Message[];
  text: string;
}): TokenUsage {
  if (
    usageMetadata?.promptTokenCount !== undefined ||
    usageMetadata?.candidatesTokenCount !== undefined ||
    usageMetadata?.totalTokenCount !== undefined
  ) {
    const promptTokens = usageMetadata.promptTokenCount ?? 0;
    const completionTokens = usageMetadata.candidatesTokenCount ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens:
        usageMetadata.totalTokenCount ??
        promptTokens +
          completionTokens +
          (usageMetadata.toolUsePromptTokenCount ?? 0) +
          (usageMetadata.thoughtsTokenCount ?? 0),
    };
  }

  const calculatedUsage = calculateCompletionUsage({
    messages,
    modelMessage: { role: 'assistant', content: text },
  });

  return {
    promptTokens: calculatedUsage.prompt_tokens,
    completionTokens: calculatedUsage.completion_tokens,
    totalTokens: calculatedUsage.total_tokens,
  };
}

export function constructGoogleTextStreamFn(model: AiModel): TextStreamFn {
  if (model.name.startsWith('anthropic/')) {
    return constructGoogleAnthropicTextStreamFn(model);
  }
  const clientConfig = createGoogleClient(model);

  return async function* getGoogleTextStream(
    { messages, model: modelName, maxTokens, temperature },
    onComplete,
  ) {
    try {
      const stream = await clientConfig.client.models.generateContentStream(
        buildGoogleGenerateContentParameters({
          messages,
          model: modelName,
          maxTokens,
          temperature,
        }),
      );

      let text = '';
      let usage: TokenUsage | undefined;

      for await (const chunk of stream) {
        assertGoogleResponseAllowed(chunk);

        const chunkText = chunk.text ?? '';
        if (chunkText !== '') {
          text += chunkText;
          yield chunkText;
        }

        if (chunk.usageMetadata) {
          usage = toTokenUsage({
            usageMetadata: chunk.usageMetadata,
            messages,
            text,
          });
        }
      }

      const resolvedUsage = usage ?? toTokenUsage({ messages, text });

      if (onComplete) {
        await onComplete(resolvedUsage);
      }
    } catch (error) {
      if (error instanceof ResponsibleAIError || error instanceof AiGenerationError) {
        throw error;
      }

      throw new AiGenerationError(formatGoogleError('Google Vertex AI Chat', error));
    }
  };
}

export function constructGoogleTextGenerationFn(model: AiModel): TextGenerationFn {
  if (model.name.startsWith('anthropic/')) {
    return constructGoogleAnthropicTextGenerationFn(model);
  }
  const clientConfig = createGoogleClient(model);

  return async function getGoogleTextGeneration({
    messages,
    model: modelName,
    maxTokens,
    temperature,
  }) {
    try {
      const response = await clientConfig.client.models.generateContent(
        buildGoogleGenerateContentParameters({
          messages,
          model: modelName,
          maxTokens,
          temperature,
        }),
      );

      assertGoogleResponseAllowed(response);

      const text = response.text ?? '';

      return {
        text,
        usage: toTokenUsage({
          usageMetadata: response.usageMetadata,
          messages,
          text,
        }),
      };
    } catch (error) {
      if (error instanceof ResponsibleAIError || error instanceof AiGenerationError) {
        throw error;
      }

      throw new AiGenerationError(formatGoogleError('Google Vertex AI Chat', error));
    }
  };
}

export function constructGoogleAgenticStreamFn(model: AiModel): AgenticStreamFn {
  if (model.name.startsWith('anthropic/')) {
    return constructGoogleAnthropicAgenticStreamFn(model);
  }
  const clientConfig = createGoogleClient(model);

  return async function* getGoogleAgenticStream({
    messages,
    model: modelName,
    maxTokens,
    temperature,
    tools,
    toolChoice,
    abortSignal,
  }) {
    try {
      const stream = await clientConfig.client.models.generateContentStream(
        buildGoogleGenerateContentParameters({
          messages,
          model: modelName,
          maxTokens,
          temperature,
          tools,
          toolChoice,
          abortSignal,
        }),
      );

      let text = '';
      let usage: TokenUsage | undefined;
      let functionCalls: NonNullable<GenerateContentResponse['functionCalls']> | undefined;

      for await (const chunk of stream) {
        assertGoogleResponseAllowed(chunk);

        const chunkText = chunk.text ?? '';
        if (chunkText !== '') {
          text += chunkText;
          yield { type: 'text', delta: chunkText };
        }

        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          functionCalls = chunk.functionCalls;
        }

        if (chunk.usageMetadata) {
          usage = toTokenUsage({
            usageMetadata: chunk.usageMetadata,
            messages,
            text,
          });
        }
      }

      if (functionCalls) {
        for (const functionCall of functionCalls) {
          if (!functionCall.name) {
            throw new AiGenerationError(
              'Incomplete tool call returned from Google Vertex AI stream',
            );
          }

          const id = functionCall.id ?? randomUUID();

          yield {
            type: 'tool_call',
            call: {
              id,
              name: functionCall.name,
              arguments: JSON.stringify(functionCall.args ?? {}),
            } satisfies ToolCall,
          };
        }
      }

      const resolvedUsage = usage ?? toTokenUsage({ messages, text });
      yield { type: 'finish', usage: resolvedUsage };
    } catch (error) {
      if (error instanceof ResponsibleAIError || error instanceof AiGenerationError) {
        throw error;
      }

      throw new AiGenerationError(formatGoogleError('Google Vertex AI Agentic stream', error));
    }
  };
}
