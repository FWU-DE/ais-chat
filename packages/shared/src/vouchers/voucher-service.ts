import { VoucherInsertModel, VoucherUpdateModel } from '@shared/db/schema';

import {
  dbGetVoucherByCode,
  dbGetVouchersByFederalStateId,
  dbInsertVouchers,
  dbRedeemVoucher,
  dbUpdateVoucher,
} from '../db/functions/voucher';
import { InvalidArgumentError } from '../error';
import { NotFoundError } from '../error/not-found-error';
import { cnanoid } from '../random/randomService';
import {
  type CreateVoucherParams,
  createVoucherSchema,
  revokeVoucherSchema,
  type Voucher,
  voucherSelectSchema,
} from './voucher';

const VOUCHER_VALIDITY_YEARS = 2;

/**
 * Generates a unique 16-character voucher code.
 *
 * Uses uppercase alphanumeric characters (0-9, A-Z) to ensure readability
 * and avoid confusion with similar-looking characters.
 *
 * @returns A 16-character uppercase alphanumeric voucher code
 */
function generateVoucherCode(): string {
  return cnanoid(16, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
}

/**
 * Gets all vouchers for a given federal state.
 *
 * @param federalStateId - The ID of the federal state to get vouchers for
 * @returns Promise that resolves to an array of validated voucher models
 */
export async function getVouchers(federalStateId: string): Promise<Voucher[]> {
  const vouchers = await dbGetVouchersByFederalStateId(federalStateId);
  return voucherSelectSchema.array().parse(vouchers);
}

/**
 * Creates multiple vouchers for a given federal state.
 *
 * Generates unique voucher codes and sets a 2-year validity period for each voucher.
 * All vouchers are created with 'created' status.
 *
 * @param federalStateId - The ID of the federal state to create vouchers for
 * @param createdBy - The user name of the person creating the vouchers
 * @param voucherData - The voucher creation data including amount, duration and number of codes
 * @returns Promise that resolves to an array of created and validated voucher models
 */
export async function createVouchers(
  federalStateId: string,
  createdBy: string,
  voucherData: CreateVoucherParams,
): Promise<Voucher[]> {
  // Validate input using zod schema
  const validatedData = createVoucherSchema.parse(voucherData);

  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + VOUCHER_VALIDITY_YEARS);

  const codesToCreate: VoucherInsertModel[] = [];
  for (let i = 0; i < validatedData.numberOfCodes; i++) {
    codesToCreate.push({
      code: generateVoucherCode(),
      increaseAmount: validatedData.increaseAmount,
      durationMonths: validatedData.durationMonths,
      validUntil: validUntil,
      federalStateId: federalStateId,
      createdBy,
      createReason: validatedData.createReason,
      status: 'created' as const,
      updateReason: '',
    });
  }

  const createdCodes = await dbInsertVouchers(codesToCreate);
  return voucherSelectSchema.array().parse(createdCodes);
}

/**
 * Revokes a voucher by setting its status to 'revoked'.
 *
 * Only vouchers that exist, belong to the specified federal state, and are not already redeemed can be revoked.
 *
 * @param code - The 16-character voucher code to revoke
 * @param federalStateId - The ID of the federal state the voucher belongs to
 * @param updatedBy - The user name of the person revoking the voucher
 * @param updateReason - The reason for revoking the voucher
 * @throws NotFoundError if voucher doesn't exist or belongs to different federal state
 * @throws VoucherAlreadyRedeemedError if voucher is already redeemed
 */
export async function revokeVoucher(
  code: string,
  federalStateId: string,
  updatedBy: string,
  updateReason: string,
): Promise<void> {
  // Validate input using zod schema
  const validatedInput = revokeVoucherSchema.parse({
    code,
    updateReason,
    revoked: true,
  });

  const voucher = await dbGetVoucherByCode(validatedInput.code);
  if (!voucher || voucher.federalStateId !== federalStateId) {
    throw new NotFoundError('Voucher not found');
  }
  if (voucher.status === 'redeemed') {
    throw new InvalidArgumentError('Voucher already redeemed and cannot be modified');
  }

  const updatedFields: VoucherUpdateModel = {
    id: voucher.id,
    updatedBy,
    updateReason: validatedInput.updateReason,
    updatedAt: new Date(),
    status: 'revoked' as const,
  };

  await dbUpdateVoucher(updatedFields);
}

/**
 * Redeems a voucher for a user.
 *
 * Validates that the voucher exists, belongs to the user's federal state,
 * has not been redeemed or revoked, and has not expired.
 *
 * @param voucherCode - The 16-character voucher code to redeem
 * @param userId - The ID of the user redeeming the voucher
 * @param federalStateId - The ID of the user's federal state
 * @throws NotFoundError if voucher doesn't exist or belongs to different federal state
 * @throws InvalidArgumentError if voucher is not in 'created' status or has expired
 */
export async function redeemVoucher({
  voucherCode,
  userId,
  federalStateId,
}: {
  voucherCode: string;
  userId: string;
  federalStateId: string;
}) {
  const result = await dbRedeemVoucher({ code: voucherCode, userId, federalStateId });
  if (!result) {
    throw new InvalidArgumentError(
      'Voucher could not be redeemed. It may not exist, has already been redeemed or revoked, has expired, or does not belong to your federal state.',
    );
  }
  return result;
}
