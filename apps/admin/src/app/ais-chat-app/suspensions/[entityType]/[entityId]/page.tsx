import { EntityType } from '@shared/entities/entity-types';
import { AdminAppSidebar } from '@/app/ais-chat-app/AdminAppSidebar';
import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { buildChatBotEntityUrl } from '@/utils/buildChatBotEntityUrl';
import { SuspensionRequestItemDetailView } from './SuspensionRequestItemDetailView';
import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';

export const dynamic = 'force-dynamic';

export default async function SuspensionRequestPage(
  props: PageProps<'/ais-chat-app/suspensions/[entityType]/[entityId]'>,
) {
  await requireAdminOrEditorAuth();
  const { entityType, entityId } = await props.params;
  const chatBotEntityUrl = buildChatBotEntityUrl(entityType as EntityType, entityId);

  return (
    <TwoColumnLayout
      sidebar={<AdminAppSidebar />}
      page={
        <SuspensionRequestItemDetailView
          entityType={entityType as EntityType}
          entityId={entityId}
          chatBotEntityUrl={chatBotEntityUrl}
        />
      }
    />
  );
}
