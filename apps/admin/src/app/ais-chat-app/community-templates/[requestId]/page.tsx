import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import CommunityTemplateRequestDetailView from './CommunityTemplateRequestDetailView';
import { AdminAppSidebar } from '../../AdminAppSidebar';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/community-templates/[requestId]'>,
) {
  const { requestId } = await props.params;
  const host = (await headers()).get('host') ?? '';

  //const request = await getCommunityTemplateRequestAction(requestId);

  return (
    <TwoColumnLayout
      sidebar={<AdminAppSidebar />}
      page={<CommunityTemplateRequestDetailView requestId={requestId} host={host} />}
    />
  );
}
