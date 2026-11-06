import { getAssistantByUser } from '@shared/assistants/assistant-service';
import { permanentRedirect } from 'next/navigation';
import z from 'zod';

import { requireAuth } from '@/auth/requireAuth';
import { handleErrorInServerComponent } from '@/error/handle-error-in-server-component';
import { parseSearchParams } from '@/utils/parse-search-params';

export const dynamic = 'force-dynamic';

const searchParamsSchema = z.object({
  create: z.string().optional().default('false'),
  templateId: z.string().optional(),
});

export default async function Page(props: PageProps<'/custom/editor/[customGptId]'>) {
  const { customGptId: assistantId } = await props.params;
  const { create } = parseSearchParams(searchParamsSchema, await props.searchParams);

  const { user } = await requireAuth();

  const { assistant } = await getAssistantByUser({
    assistantId,
    user,
  }).catch(handleErrorInServerComponent);

  const readOnly = assistant.userId !== user.id;

  if (readOnly) {
    permanentRedirect(`/assistants/${assistantId}`);
  }
  permanentRedirect(`/assistants/editor/${assistantId}${create === 'true' ? '?create=true' : ''}`);
}
