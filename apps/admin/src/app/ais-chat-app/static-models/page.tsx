import TwoColumnLayout from '@/components/layout/TwoColumnLayout';

import { AdminAppSidebar } from '../AdminAppSidebar';
import { getStaticModelConfigurationAction } from './actions';
import StaticModelConfigurationView from './StaticModelConfigurationView';

export const dynamic = 'force-dynamic';

export default async function StaticModelsPage() {
  const result = await getStaticModelConfigurationAction();
  if (!result.success) throw new Error(result.error.message);

  return (
    <TwoColumnLayout
      sidebar={<AdminAppSidebar />}
      page={<StaticModelConfigurationView {...result.value} />}
    />
  );
}
