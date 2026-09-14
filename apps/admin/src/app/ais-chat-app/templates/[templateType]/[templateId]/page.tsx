import TemplateDetailView from './TemplateDetailView';
import { isTemplateType } from '@shared/templates/template';
import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/templates/[templateType]/[templateId]'>,
) {
  await requireAdminOrEditorAuth();
  const { templateType, templateId } = await props.params;

  if (!isTemplateType(templateType)) {
    throw new Error('Invalid template type');
  }

  return <TemplateDetailView templateType={templateType} templateId={templateId} />;
}
