import { DefaultPageLayout } from '@/components/layout/default-page-layout';
import RedeemVoucherPage from './redeem-voucher-page';
import { requireAuth } from '@/auth/requireAuth';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { dbGetFederalStateById } from '@shared/db/functions/federal-state';
import {
  getMaxBudgetInCentByUser,
  getUsedBudgetInCentByUser,
} from '@shared/users/user-budget-service';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('top-up.page-titles');
  return {
    title: t('redeem'),
  };
}

export default async function Page() {
  const { user, federalState } = await requireAuth();
  // Toggles and limits fresh from the database (the session keeps the state from login)
  const current = await dbGetFederalStateById(federalState.id);
  const isTransferEnabled = current?.featureToggles.isBudgetTransferEnabled ?? false;
  const monthlyLimitInCent = current?.teacherPriceLimit ?? federalState.teacherPriceLimit;

  const canTransfer = user.userRole === 'teacher' && isTransferEnabled && user.schoolIds.length > 0;

  let availableInCent = 0;
  if (canTransfer) {
    const [maxBudget, usedBudget] = await Promise.all([
      getMaxBudgetInCentByUser({
        user,
        federalState: { ...federalState, teacherPriceLimit: monthlyLimitInCent },
      }),
      getUsedBudgetInCentByUser({ user }),
    ]);
    availableInCent = Math.max(0, Math.floor((maxBudget ?? 0) - usedBudget));
  }

  return (
    <DefaultPageLayout>
      <RedeemVoucherPage
        transfer={canTransfer ? { availableInCent, monthlyLimitInCent } : undefined}
      />
    </DefaultPageLayout>
  );
}
