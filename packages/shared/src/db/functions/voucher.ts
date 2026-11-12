import { and, eq, gt, sql, sum } from 'drizzle-orm';

import { db } from '..';
import { VoucherInsertModel, VoucherTable, VoucherUpdateModel } from '../schema';

export async function dbGetCreditIncreaseForCurrentMonth(userId: string) {
  const [result] = await db
    .select({
      totalPriceLimit: sum(VoucherTable.increaseAmount),
    })
    .from(VoucherTable)
    .where(
      and(
        eq(VoucherTable.status, 'redeemed'),
        eq(VoucherTable.redeemedBy, userId),
        gt(
          sql`date_trunc('month', redeemed_at) + make_interval(months:=duration_months)`,
          sql`now()`,
        ),
      ),
    );

  return Number(result?.totalPriceLimit ?? 0);
}

export async function dbInsertVouchers(vouchers: VoucherInsertModel[]) {
  return await db.insert(VoucherTable).values(vouchers).returning();
}

export async function dbGetVouchersByFederalStateId(federalStateId: string) {
  return await db
    .select()
    .from(VoucherTable)
    .where(and(eq(VoucherTable.federalStateId, federalStateId)));
}

export async function dbGetVoucherByCode(code: string) {
  const [result] = await db.select().from(VoucherTable).where(eq(VoucherTable.code, code)).limit(1);
  return result;
}

export async function dbUpdateVoucher(voucher: VoucherUpdateModel) {
  const [result] = await db
    .update(VoucherTable)
    .set(voucher)
    .where(eq(VoucherTable.id, voucher.id))
    .returning();
  return result;
}

export async function dbRedeemVoucher({
  code,
  userId,
  federalStateId,
}: {
  code: string;
  userId: string;
  federalStateId: string;
}) {
  const [result] = await db
    .update(VoucherTable)
    .set({ status: 'redeemed', redeemedBy: userId, redeemedAt: new Date() })
    .where(
      and(
        eq(VoucherTable.code, code),
        eq(VoucherTable.status, 'created'),
        eq(VoucherTable.federalStateId, federalStateId),
        gt(VoucherTable.validUntil, sql`now()`),
      ),
    )
    .returning();
  return result;
}
