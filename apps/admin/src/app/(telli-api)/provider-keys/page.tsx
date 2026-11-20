import { getProviderKeysAction } from './actions';
import { ProviderKeyListView } from './ProviderKeyListView';

export default async function ProviderKeysPage() {
  const result = await getProviderKeysAction();
  if (!result.success) throw new Error(result.error.message);
  return <ProviderKeyListView providerKeys={result.value} />;
}
