'use server';

import { requireAuth } from '@/auth/requireAuth';
import { runServerAction } from '@shared/actions/run-server-action';
import { createBudgetTransfer, redeemVoucher } from '@shared/vouchers/voucher-service';
import { dbGetFederalStateById } from '@shared/db/functions/federal-state';

export async function redeemVoucherAction(voucherCode: string) {
  const { user, federalState } = await requireAuth();

  return runServerAction(
    'redeemVoucherAction',
    redeemVoucher,
  )({
    voucherCode,
    userId: user.id,
    federalStateId: federalState.id,
    userRole: user.userRole,
    schoolIds: user.schoolIds,
  });
}

export async function createBudgetTransferAction(amountInCent: number) {
  const { user, federalState } = await requireAuth();
  // The session keeps the federal state from login; read toggles and limits fresh so that
  // changes in the admin take effect without signing in again.
  const current = await dbGetFederalStateById(federalState.id);

  return runServerAction(
    'createBudgetTransferAction',
    createBudgetTransfer,
  )({
    user,
    federalState: current
      ? {
          ...federalState,
          featureToggles: current.featureToggles,
          teacherPriceLimit: current.teacherPriceLimit,
        }
      : federalState,
    amountInCent,
  });
}
