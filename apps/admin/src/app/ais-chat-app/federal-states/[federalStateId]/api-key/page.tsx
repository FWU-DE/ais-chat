import { getFederalStateByIdAction } from '../actions';
import { getApiKeyOptionsAction } from './actions';
import { FederalStateUpdateApiKey } from './FederalStateUpdateApiKey';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: PageProps<'/ais-chat-app/federal-states/[federalStateId]/api-key'>,
) {
  const { federalStateId } = await props.params;
  const [federalState, apiKeys] = await Promise.all([
    getFederalStateByIdAction(federalStateId),
    getApiKeyOptionsAction(),
  ]);

  return (
    <div>
      <FederalStateUpdateApiKey federalState={federalState} apiKeys={apiKeys} />
    </div>
  );
}
