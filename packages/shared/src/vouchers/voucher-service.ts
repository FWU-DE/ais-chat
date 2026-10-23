import {
  type Voucher,
  type CreateVoucherParams,
  createBudgetTransferSchema,
  createVoucherSchema,
  getBudgetTransferCreatedByTag,
  getBudgetTransferDonorId,
  revokeVoucherSchema,
  voucherSelectSchema,
} from './voucher';
import {
  dbGetVoucherByCode,
  dbGetVouchersByFederalStateId,
  dbInsertVouchers,
  dbRedeemVoucher,
  dbUpdateVoucher,
} from '../db/functions/voucher';
import { dbGetUserById } from '../db/functions/user';
import { VoucherInsertModel, VoucherUpdateModel } from '@shared/db/schema';
import { cnanoid } from '../random/randomService';
import { NotFoundError } from '../error/not-found-error';
import { ForbiddenError, InvalidArgumentError } from '../error';
import { FederalStateModel } from '@shared/federal-states/types';
import { UserModel } from '@shared/auth/user-model';
import {
  getMaxBudgetInCentByUser,
  getUsedBudgetInCentByUser,
} from '@shared/users/user-budget-service';
import { getEndOfCurrentMonth } from '../utils/date';

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
  userRole,
  schoolIds,
}: {
  voucherCode: string;
  userId: string;
  federalStateId: string;
  userRole?: UserModel['userRole'];
  schoolIds?: string[];
}) {
  const voucher = await dbGetVoucherByCode(voucherCode);
  const donorId = voucher ? getBudgetTransferDonorId(voucher.createdBy) : undefined;
  if (donorId !== undefined) {
    await assertBudgetTransferRedeemable({ donorId, userId, userRole, schoolIds });
  }

  const result = await dbRedeemVoucher({ code: voucherCode, userId, federalStateId });
  if (!result) {
    throw new InvalidArgumentError(
      'Voucher could not be redeemed. It may not exist, has already been redeemed or revoked, has expired, or does not belong to your federal state.',
    );
  }
  return result;
}

/**
 * A budget transfer voucher may only be redeemed by another teacher of the donor's school.
 */
async function assertBudgetTransferRedeemable({
  donorId,
  userId,
  userRole,
  schoolIds,
}: {
  donorId: string;
  userId: string;
  userRole?: UserModel['userRole'];
  schoolIds?: string[];
}) {
  if (donorId === userId) {
    throw new InvalidArgumentError('You cannot redeem your own budget transfer code.');
  }
  if (userRole !== 'teacher') {
    throw new ForbiddenError('Budget transfer codes can only be redeemed by teachers.');
  }
  const donor = await dbGetUserById({ userId: donorId });
  const sharesSchool = donor?.schoolIds.some((id) => schoolIds?.includes(id)) ?? false;
  if (!sharesSchool) {
    throw new ForbiddenError('Budget transfer codes can only be redeemed within the same school.');
  }
}

/**
 * Creates a voucher from the teacher's unused budget of the current month, to be passed on to a
 * colleague of the same school. The amount is deducted from the donor's budget immediately (see
 * getMaxBudgetInCentByUser); the voucher is valid until the end of the current month.
 *
 * @returns The voucher code, the amount and the date until which it can be redeemed
 */
export async function createBudgetTransfer({
  user,
  federalState,
  amountInCent,
}: {
  user: Pick<UserModel, 'id' | 'userRole' | 'schoolIds'>;
  federalState: FederalStateModel;
  amountInCent: number;
}): Promise<{ code: string; amountInCent: number; validUntil: Date }> {
  if (!federalState.featureToggles.isBudgetTransferEnabled) {
    throw new ForbiddenError('Budget transfer is not enabled for this federal state.');
  }
  if (user.userRole !== 'teacher') {
    throw new ForbiddenError('Only teachers can pass on budget.');
  }
  if (user.schoolIds.length === 0) {
    throw new ForbiddenError('Budget can only be passed on within a school.');
  }
  const { amountInCent: amount } = createBudgetTransferSchema.parse({ amountInCent });

  const [maxBudget, usedBudget] = await Promise.all([
    getMaxBudgetInCentByUser({ user, federalState }),
    getUsedBudgetInCentByUser({ user }),
  ]);
  const availableInCent = Math.floor((maxBudget ?? 0) - usedBudget);
  if (amount > availableInCent) {
    throw new InvalidArgumentError('The amount exceeds the unused budget of this month.');
  }

  const validUntil = getEndOfCurrentMonth();
  const [created] = await dbInsertVouchers([
    {
      code: generateVoucherCode(),
      increaseAmount: amount,
      durationMonths: 1,
      validUntil,
      federalStateId: federalState.id,
      createdBy: getBudgetTransferCreatedByTag(user.id),
      createReason: 'Weitergabe von Tokenvolumen',
      status: 'created' as const,
      updateReason: '',
    },
  ]);
  if (!created) {
    throw new Error('Budget transfer voucher could not be created');
  }
  return { code: created.code, amountInCent: amount, validUntil };
}
