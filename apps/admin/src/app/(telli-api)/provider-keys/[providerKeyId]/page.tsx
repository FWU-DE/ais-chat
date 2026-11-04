import { notFound } from 'next/navigation';
import { getProviderKeysAction } from '../actions';
import { ProviderKeyDetailView } from './ProviderKeyDetailView';

export const dynamic = 'force-dynamic';

export default async function ProviderKeyPage(props: PageProps<'/provider-keys/[providerKeyId]'>) {
  const { providerKeyId } = await props.params;
  if (providerKeyId === 'new') {
    return <ProviderKeyDetailView mode="create" />;
  }

  const result = await getProviderKeysAction();
  if (!result.success) throw new Error(result.error.message);
  const providerKey = result.value.find(({ id }) => id === providerKeyId);
  if (!providerKey) notFound();

  return <ProviderKeyDetailView providerKey={providerKey} mode="edit" />;
}
