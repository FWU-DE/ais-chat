import ProjectDetailView from './ProjectDetailView';

export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await props.params;

  return <ProjectDetailView projectId={projectId} />;
}
