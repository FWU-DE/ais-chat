import { dbGetAllApiKeys } from '@ais-chat/api-database';
import { getFederalStateById } from '@shared/federal-states/federal-state-service';

import { FederalStateUpdateApiKey } from './FederalStateUpdateApiKey';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/federal-states/[federalStateId]/api-key'>,
) {
  const { federalStateId } = await props.params;
  const [federalState, apiKeys] = await Promise.all([
    getFederalStateById(federalStateId),
    dbGetAllApiKeys(),
  ]);

  return (
    <div>
      <FederalStateUpdateApiKey federalState={federalState} apiKeys={apiKeys} />
    </div>
  );
}
