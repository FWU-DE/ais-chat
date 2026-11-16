import { assertApiKeyCanUseModel } from '../api-keys/access';
import { billTextGenerationUsageToApiKey } from '../api-keys/billing';
import { hasAccessToModel } from '../api-keys/model-access';
import { normalizeAiGenerationError } from '../errors';
import { getTextModelById } from '../models';
import { recordEstimatedTokenUsage } from './metrics/estimated-token-usage';
import { getUsedModelId } from './model-selection';
import { generateAgenticStream } from './providers';
import type { GenerationOptions, Message, ModelSelection, StreamEvent, TokenUsage } from './types';

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
    /** The real upstream provider that served the request (falls back to the billing model's own provider). */
    provider: string;
    /** The real upstream model name that served the request (falls back to the billing model's own name). */
    modelName: string;
  }) => void | Promise<void>,
  options?: GenerationOptions,
): AsyncGenerator<StreamEvent> {
  const [modelId, ...fallbackModelIds] = selection.modelIds;
  const model = await getTextModelById(modelId);

  await assertApiKeyCanUseModel(apiKeyId, model, 'text');

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

        if (event.usage.estimated) {
          recordEstimatedTokenUsage({
            modelName: billingModel.name,
            provider: billingModel.provider,
          });
        }
        if (onComplete) {
          await onComplete({
            usage: event.usage,
            priceInCents,
            modelId: usedModelId,
            provider: event.provider ?? billingModel.provider,
            modelName: event.modelName ?? billingModel.name,
          });
        }
      }
    }
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Agentic stream failed');
  }
}
