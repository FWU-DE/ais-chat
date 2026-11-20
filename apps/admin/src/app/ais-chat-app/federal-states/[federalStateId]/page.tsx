import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { Sidebar, SidebarItem } from '@/components/navigation/Sidebar';
import { ROUTES } from '@/consts/routes';

import { getApiKeyOptionsAction, getFederalStateByIdAction } from './actions';
import { FederalStateView } from './FederalStateDetailView';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/federal-states/[federalStateId]'>,
) {
  const { federalStateId } = await props.params;
  const [federalState, apiKeys] = await Promise.all([
    getFederalStateByIdAction(federalStateId),
    getApiKeyOptionsAction(federalStateId),
  ]);

  return (
    <TwoColumnLayout
      sidebar={
        <Sidebar>
          <SidebarItem label="Guthaben Codes" href={ROUTES.app.vouchers(federalStateId)} />
        </Sidebar>
      }
      page={<FederalStateView federalState={federalState} apiKeys={apiKeys} />}
    />
  );
}
