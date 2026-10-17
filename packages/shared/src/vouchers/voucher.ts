import { createSelectSchema } from 'drizzle-zod';
import z from 'zod';
import { VoucherTable } from '../db/schema';

// Generate zod schemas from the database table
export const voucherSelectSchema = createSelectSchema(VoucherTable).extend({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
  redeemedAt: z.coerce.date().nullable(),
  validUntil: z.coerce.date(),
});

export const createVoucherSchema = z.object({
  increaseAmount: z.number().min(1).max(20_000),
  durationMonths: z.number().min(1).max(12).default(3),
  createReason: z.string().min(1).max(500),
  numberOfCodes: z.number().min(1).default(1),
});

/**
 * Budget transfer between teachers of the same school: a transfer voucher is created from the
 * donor's unused monthly budget and marked via `createdBy` (no extra column needed).
 */
export const BUDGET_TRANSFER_CREATED_BY_PREFIX = 'transfer:';

export function getBudgetTransferCreatedByTag(userId: string): string {
  return `${BUDGET_TRANSFER_CREATED_BY_PREFIX}${userId}`;
}

/** Returns the donor's user id if the voucher is a budget transfer, otherwise undefined. */
export function getBudgetTransferDonorId(createdBy: string): string | undefined {
  return createdBy.startsWith(BUDGET_TRANSFER_CREATED_BY_PREFIX)
    ? createdBy.slice(BUDGET_TRANSFER_CREATED_BY_PREFIX.length)
    : undefined;
}

export const createBudgetTransferSchema = z.object({
  amountInCent: z.number().int().min(1).max(20_000),
});

// Business layer types
export type Voucher = z.infer<typeof voucherSelectSchema>;

// API/Form parameter types
export type CreateVoucherParams = z.infer<typeof createVoucherSchema>;

export const revokeVoucherSchema = z.object({
  code: z.string().length(16),
  revoked: z.boolean().refine((val) => val === true, {
    error: "Only voucher revocation is supported. 'revoked' must be true.",
  }),
  updateReason: z.string().min(1).max(500),
});
