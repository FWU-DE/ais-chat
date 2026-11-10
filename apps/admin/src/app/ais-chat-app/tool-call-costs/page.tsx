import { getToolCallCostByName } from '@shared/tool-call-costs/tool-call-cost-service';

import TwoColumnLayout from '@/components/layout/TwoColumnLayout';

import { AdminAppSidebar } from '../AdminAppSidebar';
import ToolCallCostListView from './ToolCallCostListView';

export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten.';
}

export default async function ToolCallCostsPage() {
  let initialToolCallCost = null;
  let initialLoadError: string | null = null;

  try {
    initialToolCallCost = await getToolCallCostByName('web_search');
  } catch (error) {
    initialLoadError = getErrorMessage(error);
  }

  return (
    <TwoColumnLayout
      sidebar={<AdminAppSidebar />}
      page={
        <ToolCallCostListView
          initialToolCallCost={initialToolCallCost}
          initialLoadError={initialLoadError}
        />
      }
    />
  );
}
