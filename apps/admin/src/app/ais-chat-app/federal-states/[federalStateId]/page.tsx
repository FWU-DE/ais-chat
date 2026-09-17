import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { getFederalStateByIdAction } from './actions';
import { FederalStateView } from './FederalStateDetailView';
import { Sidebar, SidebarItem } from '@/components/navigation/Sidebar';
import { ROUTES } from '@/consts/routes';
import FederalStateAutoForm from './FederalStateAutoForm';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/federal-states/[federalStateId]'>,
) {
  const { federalStateId } = await props.params;
  const searchParams = await props.searchParams;
  const federalState = await getFederalStateByIdAction(federalStateId);

  return (
    <TwoColumnLayout
      sidebar={
        <Sidebar>
          <SidebarItem label="API Key aktualisieren" href={ROUTES.app.apiKey(federalStateId)} />
          <SidebarItem label="Guthaben Codes" href={ROUTES.app.vouchers(federalStateId)} />
        </Sidebar>
      }
      page={
        searchParams?.auto === 'true' ? (
          <FederalStateAutoForm federalState={federalState} />
        ) : (
          <FederalStateView federalState={federalState} />
        )
      }
    />
  );
}
