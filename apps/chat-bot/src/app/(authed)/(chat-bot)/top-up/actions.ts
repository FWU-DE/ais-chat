'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { redeemVoucher } from '@shared/vouchers/voucher-service';

import { requireAuth } from '@/auth/requireAuth';

export async function redeemVoucherAction(voucherCode: string) {
  const { user, federalState } = await requireAuth();

  return runServerAction(
    'redeemVoucherAction',
    redeemVoucher,
  )({
    voucherCode,
    userId: user.id,
    federalStateId: federalState.id,
  });
}
