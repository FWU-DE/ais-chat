import { getApiKeyByIdAction } from '../actions';
import { ApiKeyDetailView } from '../ApiKeyDetailView';

export default async function ApiKeyDetailPage(
  props: PageProps<'/projects/[projectId]/api-keys/[apiKeyId]'>,
) {
  const { projectId, apiKeyId } = await props.params;

  const apiKey = await getApiKeyByIdAction(projectId, apiKeyId);

  return (
    <div className="container mx-auto py-8">
      <ApiKeyDetailView projectId={projectId} apiKey={apiKey} mode="edit" />
    </div>
  );
}
