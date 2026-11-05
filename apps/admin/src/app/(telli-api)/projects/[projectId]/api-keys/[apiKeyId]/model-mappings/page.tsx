import { ModelApiKeyMappingListView } from './ModelApiKeyMappingListView';

export const dynamic = 'force-dynamic';

export default async function ModelApiKeyMappingsPage(
  props: PageProps<'/projects/[projectId]/api-keys/[apiKeyId]/model-mappings'>,
) {
  const { projectId, apiKeyId } = await props.params;

  return <ModelApiKeyMappingListView projectId={projectId} apiKeyId={apiKeyId} />;
}
