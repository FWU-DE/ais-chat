import { billTextGenerationUsageToApiKey, isApiKeyOverQuota } from '../api-keys/billing';
import { generateAgenticStream } from './providers';
import { hasAccessToModel } from '../api-keys/model-access';
import { ApiKeyQuotaExceededError, InvalidModelError, normalizeAiGenerationError } from '../errors';
import { getTextModelById } from '../models';
import { getUsedModelId } from './model-selection';
import type { TokenUsage, GenerationOptions, StreamEvent, Message, ModelSelection } from './types';

/**
 * Generates streaming agentic output using the specified model and messages, with access control and billing.
 *
 * This function first verifies that the provided API key has access to the requested text model.
 * Note: Billing happens after the stream completes when usage data is available.
 *
 * @param selection - The model selection (candidate model IDs, display name, and usage callback) to use for generation
 * @param messages - The conversation messages (system, user, assistant)
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 * @param onComplete - Called after the stream finishes with usage and cost
 * @param options - Must include `tools` for the model to invoke
 *
 * @returns An async generator yielding StreamEvent objects
 */
export async function* generateAgenticStreamWithBilling(
  selection: ModelSelection,
  messages: Message[],
  apiKeyId: string,
  onComplete?: (result: {
    usage: TokenUsage;
    priceInCents: number;
    modelId: string;
  }) => void | Promise<void>,
  options?: GenerationOptions,
): AsyncGenerator<StreamEvent> {
  const [modelId, ...fallbackModelIds] = selection.modelIds;
  const model = await getTextModelById(modelId);

  const [hasAccess, isOverQuota] = await Promise.all([
    hasAccessToModel(apiKeyId, model),
    isApiKeyOverQuota(apiKeyId),
  ]);

  if (!hasAccess) {
    throw new InvalidModelError(`API key does not have access to the text model: ${model.name}`);
  }

  if (isOverQuota) {
    throw new ApiKeyQuotaExceededError(`API key has exceeded its monthly quota`);
  }

  try {
    const fallbackModels = (
      await Promise.all(
        fallbackModelIds.map(async (id) => {
          const fallbackModel = await getTextModelById(id);
          return (await hasAccessToModel(apiKeyId, fallbackModel)) ? fallbackModel : undefined;
        }),
      )
    ).filter(
      (fallbackModel): fallbackModel is NonNullable<typeof fallbackModel> =>
        fallbackModel !== undefined,
    );
    const stream = generateAgenticStream(model, messages, { ...options, fallbackModels });

    for await (const event of stream) {
      yield event;

      if (event.type === 'finish') {
        const usedModelId = getUsedModelId(selection, event.modelId);
        const billingModel =
          [model, ...fallbackModels].find((candidate) => candidate.id === usedModelId) ?? model;
        const priceInCents = await billTextGenerationUsageToApiKey(
          apiKeyId,
          billingModel,
          event.usage,
        );
        if (onComplete) {
          await onComplete({ usage: event.usage, priceInCents, modelId: usedModelId });
        }
      }
    }
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Agentic stream failed');
  }
}
