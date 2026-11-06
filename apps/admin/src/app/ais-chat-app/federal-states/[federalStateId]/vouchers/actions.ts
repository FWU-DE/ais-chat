'use server';

import { type CreateVoucherParams } from '@ais-chat/shared/vouchers/voucher';
import {
  createVouchers,
  getVouchers,
  revokeVoucher,
} from '@ais-chat/shared/vouchers/voucher-service';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

export async function getVouchersAction(federalStateId: string) {
  await requireAdminAuth();

  return getVouchers(federalStateId);
}

export async function createVouchersAction(
  federalStateId: string,
  voucherData: Omit<CreateVoucherParams, 'createdBy'>,
) {
  const session = await requireAdminAuth();

  return createVouchers(federalStateId, session.user.name, voucherData);
}

export async function revokeVoucherAction(
  code: string,
  federalStateId: string,
  updateReason: string,
) {
  const session = await requireAdminAuth();

  return revokeVoucher(code, federalStateId, session.user.name, updateReason);
}
