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
