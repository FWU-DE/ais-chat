import { notFound } from 'next/navigation';
import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import CommunityTemplateRequestDetailView from './CommunityTemplateRequestDetailView';
import { AdminAppSidebar } from '../../AdminAppSidebar';
import { buildChatBotEntityUrl } from '@/utils/buildChatBotEntityUrl';
import { getCommunityTemplateRequestWithEventsForAdminAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/community-templates/[requestId]'>,
) {
  const { requestId } = await props.params;

  const result = await getCommunityTemplateRequestWithEventsForAdminAction(requestId);
  if (!result.success) {
    if (result.error.statusCode === 404) notFound();
    throw new Error(result.error.message);
  }

  const { entityType, assistantId, characterId, learningScenarioId } = result.value;
  const chatBotEntityUrl = buildChatBotEntityUrl(
    entityType,
    assistantId ?? characterId ?? learningScenarioId ?? '',
  );

  return (
    <TwoColumnLayout
      sidebar={<AdminAppSidebar />}
      page={
        <CommunityTemplateRequestDetailView
          requestId={requestId}
          chatBotEntityUrl={chatBotEntityUrl}
          initialData={result.value}
        />
      }
    />
  );
}
