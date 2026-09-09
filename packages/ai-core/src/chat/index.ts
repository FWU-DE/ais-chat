import { billTextGenerationUsageToApiKey, isApiKeyOverQuota } from '../api-keys/billing';
import { generateText, generateTextStream } from './providers';
import { hasAccessToModel } from '../api-keys/model-access';
import { InvalidModelError, normalizeAiGenerationError, RateLimitExceededError } from '../errors';
import { getTextModelById, getTextModelByName } from '../models';
import { getUsedModelId, normalizeModelSelection } from './model-selection';
import type { Message, TokenUsage, GenerationOptions, ModelSelection } from './types';
export { runAgentLoop, MAX_AGENTIC_ITERATIONS, MAX_TOOL_CALLS_PER_ITERATION } from './agent-loop';
export { generateAgenticStreamWithBilling } from './agentic-stream';
export { countTokens } from './utils';

// Re-export types for external consumers
export type {
  Message,
  TokenUsage,
  ChatAttachment,
  ChatImageAttachment,
  GenerationOptions,
  ToolCall,
  ToolDefinition,
  ToolHandler,
  ToolRegistry,
  ToolRegistryEntry,
  StreamEvent,
  AgenticStreamFn,
  ModelSelection,
} from './types';

// Re-export utility functions and guards
export { isChatImageAttachment } from './types';

/**
 * Generates text using the specified model and messages, with access control and billing.
 *
 * This function first verifies that the provided API key has access to the requested text model.
 * If access is granted, it generates the text and bills the usage to the API key.
 *
 * @param modelId - The ID of the text model to use for generation
 * @param messages - The conversation messages (system, user, assistant)
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 *
 * @returns A promise that resolves to an object containing the generated text response, usage, and the price in cents
 */
export async function generateTextWithBilling(
  modelSelection: string | ModelSelection,
  messages: Message[],
  apiKeyId: string,
  options?: GenerationOptions,
) {
  const selection = normalizeModelSelection(modelSelection);
  const [modelId, ...fallbackModelIds] = selection.modelIds;
  const model = await getTextModelById(modelId);

  // Run access check and quota check in parallel for better performance
  const [hasAccess, isOverQuota] = await Promise.all([
    hasAccessToModel(apiKeyId, model),
    isApiKeyOverQuota(apiKeyId),
  ]);

  if (!hasAccess) {
    throw new InvalidModelError(`API key does not have access to the text model: ${model.name}`);
  }

  if (isOverQuota) {
    throw new RateLimitExceededError(`API key has exceeded its monthly quota`);
  }

  try {
    const fallbackModels = await resolveFallbackModels(fallbackModelIds, apiKeyId);
    const generationOptions = fallbackModels.length ? { ...options, fallbackModels } : options;
    const textResponse = await generateText(model, messages, generationOptions);
    const usedModelId = getUsedModelId(selection, textResponse.modelId);
    const billingModel = getModelById([model, ...fallbackModels], usedModelId) ?? model;
    const priceInCents = await billTextGenerationUsageToApiKey(
      apiKeyId,
      billingModel,
      textResponse.usage,
    );
    await selection.onModelUsed?.(usedModelId);

    return {
      ...textResponse,
      modelId: usedModelId,
      priceInCents,
    };
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Text generation failed');
  }
}

/**
 * Generates streaming text using the specified model and messages, with access control.
 *
 * This function first verifies that the provided API key has access to the requested text model.
 * Note: Billing happens after the stream completes when usage data is available.
 *
 * @param modelId - The ID of the text model to use for generation
 * @param messages - The conversation messages (system, user, assistant)
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 * @param onComplete - Optional callback to be invoked after stream completion with usage and price data
 *
 * @returns An async generator that yields text chunks and returns usage data with price
 */
export async function* generateTextStreamWithBilling(
  modelSelection: string | ModelSelection,
  messages: Message[],
  apiKeyId: string,
  onComplete?: (result: {
    usage: TokenUsage;
    priceInCents: number;
    modelId: string;
  }) => void | Promise<void>,
  options?: GenerationOptions,
) {
  const selection = normalizeModelSelection(modelSelection);
  const [modelId, ...fallbackModelIds] = selection.modelIds;
  const model = await getTextModelById(modelId);

  // Run access check and quota check in parallel for better performance
  const [hasAccess, isOverQuota] = await Promise.all([
    hasAccessToModel(apiKeyId, model),
    isApiKeyOverQuota(apiKeyId),
  ]);

  if (!hasAccess) {
    throw new InvalidModelError(`API key does not have access to the text model: ${model.name}`);
  }

  if (isOverQuota) {
    throw new RateLimitExceededError(`API key has exceeded its monthly quota`);
  }

  try {
    const fallbackModels = await resolveFallbackModels(fallbackModelIds, apiKeyId);
    const billingCallback = async (usage: TokenUsage, modelId?: string) => {
      const usedModelId = getUsedModelId(selection, modelId);
      const billingModel = getModelById([model, ...fallbackModels], usedModelId) ?? model;
      const priceInCents = await billTextGenerationUsageToApiKey(apiKeyId, billingModel, usage);
      await selection.onModelUsed?.(usedModelId);
      if (onComplete) {
        await onComplete({ usage, priceInCents, modelId: usedModelId });
      }
    };

    const generationOptions = fallbackModels.length ? { ...options, fallbackModels } : options;
    const stream = generateTextStream(model, messages, billingCallback, generationOptions);

    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Text generation failed');
  }
}

async function resolveFallbackModels(modelIds: string[] | undefined, apiKeyId: string) {
  if (!modelIds?.length) return [];
  const models = await Promise.all(
    modelIds.map(async (modelId) => {
      const model = await getTextModelById(modelId);
      return (await hasAccessToModel(apiKeyId, model)) ? model : undefined;
    }),
  );
  return models.filter((model): model is NonNullable<typeof model> => model !== undefined);
}

function getModelById<T extends { id: string }>(models: T[], modelId: string | undefined) {
  return modelId ? models.find((candidate) => candidate.id === modelId) : undefined;
}

// ── Name-based variants (for API app) ──

/**
 * Generates text using a model looked up by name, with access control and billing.
 *
 * @param modelName - The name of the text model to use for generation
 * @param messages - The conversation messages (system, user, assistant)
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 *
 * @returns A promise that resolves to an object containing the generated text response, usage, price, and model metadata
 */
export async function generateTextByNameWithBilling(
  modelName: string,
  messages: Message[],
  apiKeyId: string,
  options?: GenerationOptions,
) {
  const model = await getTextModelByName(modelName, apiKeyId);
  const textResponse = await generateTextWithBilling(model.id, messages, apiKeyId, options);
  return { ...textResponse, model };
}

/**
 * Generates streaming text using a model looked up by name, with access control.
 *
 * @param modelName - The name of the text model to use for generation
 * @param messages - The conversation messages (system, user, assistant)
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 * @param onComplete - Optional callback to be invoked after stream completion with usage and price data
 *
 * @returns An object with the model and an async generator that yields text chunks
 */
export async function generateTextStreamByNameWithBilling(
  modelName: string,
  messages: Message[],
  apiKeyId: string,
  onComplete?: (result: { usage: TokenUsage; priceInCents: number }) => void | Promise<void>,
  options?: GenerationOptions,
) {
  const model = await getTextModelByName(modelName, apiKeyId);
  const stream = generateTextStreamWithBilling(model.id, messages, apiKeyId, onComplete, options);
  return { stream, model };
}
