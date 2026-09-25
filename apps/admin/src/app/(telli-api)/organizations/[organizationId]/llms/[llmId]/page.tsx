import { getLargeLanguageModelsAction } from '../actions';
import { LargeLanguageModelDetailView } from './LargeLanguageModelDetailView';
import { LlmApiKeyAssignmentsView } from './LlmApiKeyAssignmentsView';
import { getProviderKeysAction } from '../../provider-keys/actions';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/organizations/[organizationId]/llms/[llmId]'>,
) {
  const { organizationId, llmId } = await props.params;
  const providerKeysResult = await getProviderKeysAction(organizationId);
  if (!providerKeysResult.success) throw new Error(providerKeysResult.error.message);
  const providerKeys = providerKeysResult.value;

  if (llmId === 'new') {
    // Create new LLM
    return (
      <LargeLanguageModelDetailView
        organizationId={organizationId}
        providerKeys={providerKeys}
        mode="create"
      />
    );
  }

  // Edit existing LLM
  const models = await getLargeLanguageModelsAction(organizationId);
  const model = models.find((m) => m.id === llmId);

  if (!model) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Modell nicht gefunden</h1>
        <p className="text-gray-600 mt-2">
          Das angeforderte Sprachmodell konnte nicht gefunden werden.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <LargeLanguageModelDetailView
        organizationId={organizationId}
        model={model}
        providerKeys={providerKeys}
        mode="edit"
      />
      <LlmApiKeyAssignmentsView organizationId={organizationId} modelId={model.id} />
    </div>
  );
}
