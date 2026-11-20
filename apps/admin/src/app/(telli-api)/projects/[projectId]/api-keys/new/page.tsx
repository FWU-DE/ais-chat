import { ApiKeyDetailView } from '../ApiKeyDetailView';

export default async function NewApiKeyPage(
  props: PageProps<'/projects/[projectId]/api-keys/new'>,
) {
  const { projectId } = await props.params;

  return (
    <div className="container mx-auto py-8">
      <ApiKeyDetailView projectId={projectId} mode="create" />
    </div>
  );
}
