import { getFederalStateById } from '@shared/federal-states/federal-state-service';

import { FederalStateUpdateApiKey } from './FederalStateUpdateApiKey';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/federal-states/[federalStateId]/api-key'>,
) {
  const { federalStateId } = await props.params;
  const federalState = await getFederalStateById(federalStateId);

  return (
    <div>
      <FederalStateUpdateApiKey federalState={federalState} />
    </div>
  );
}
