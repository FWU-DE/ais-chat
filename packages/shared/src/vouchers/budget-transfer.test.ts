// Rules for passing on budget between teachers (budget transfer vouchers)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbGetVoucherByCode: vi.fn(),
  dbRedeemVoucher: vi.fn(),
  dbInsertVouchers: vi.fn(),
  dbGetUserById: vi.fn(),
  getMaxBudgetInCentByUser: vi.fn(),
  getUsedBudgetInCentByUser: vi.fn(),
}));

vi.mock('../db/functions/voucher', () => ({
  dbGetVoucherByCode: mocks.dbGetVoucherByCode,
  dbRedeemVoucher: mocks.dbRedeemVoucher,
  dbInsertVouchers: mocks.dbInsertVouchers,
  dbGetVouchersByFederalStateId: vi.fn(),
  dbUpdateVoucher: vi.fn(),
}));
vi.mock('../db/functions/user', () => ({ dbGetUserById: mocks.dbGetUserById }));
vi.mock('@shared/users/user-budget-service', () => ({
  getMaxBudgetInCentByUser: mocks.getMaxBudgetInCentByUser,
  getUsedBudgetInCentByUser: mocks.getUsedBudgetInCentByUser,
}));

import { createBudgetTransfer, redeemVoucher } from './voucher-service';

const teacher = { id: 'a', userRole: 'teacher' as const, schoolIds: ['s1'] };
const federalState = {
  id: 'DE-HH',
  teacherPriceLimit: 500,
  featureToggles: { isBudgetTransferEnabled: true },
} as never;

describe('createBudgetTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMaxBudgetInCentByUser.mockResolvedValue(500);
    mocks.getUsedBudgetInCentByUser.mockResolvedValue(200);
    mocks.dbInsertVouchers.mockImplementation(async (v) => v.map((x: object) => ({ ...x })));
  });

  it('creates a code up to the unused budget, marked with transfer:<id>', async () => {
    const result = await createBudgetTransfer({ user: teacher, federalState, amountInCent: 300 });
    expect(result.code).toHaveLength(16);
    const inserted = mocks.dbInsertVouchers.mock.calls[0]?.[0]?.[0];
    expect(inserted).toMatchObject({
      createdBy: 'transfer:a',
      increaseAmount: 300,
      durationMonths: 1,
    });
  });

  it('rejects more than the unused budget', async () => {
    await expect(
      createBudgetTransfer({ user: teacher, federalState, amountInCent: 301 }),
    ).rejects.toThrow(/exceeds/);
    expect(mocks.dbInsertVouchers).not.toHaveBeenCalled();
  });

  it('rejects when the toggle is off', async () => {
    const off = { ...(federalState as object), featureToggles: {} } as never;
    await expect(
      createBudgetTransfer({ user: teacher, federalState: off, amountInCent: 10 }),
    ).rejects.toThrow(/not enabled/);
  });

  it('rejects students and teachers without a school', async () => {
    await expect(
      createBudgetTransfer({
        user: { ...teacher, userRole: 'student' },
        federalState,
        amountInCent: 10,
      }),
    ).rejects.toThrow();
    await expect(
      createBudgetTransfer({ user: { ...teacher, schoolIds: [] }, federalState, amountInCent: 10 }),
    ).rejects.toThrow();
  });
});

describe('redeemVoucher with a budget transfer code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbGetVoucherByCode.mockResolvedValue({ createdBy: 'transfer:a' });
    mocks.dbGetUserById.mockResolvedValue({ id: 'a', schoolIds: ['s1'] });
    mocks.dbRedeemVoucher.mockResolvedValue({ id: 'v1' });
  });
  const base = { voucherCode: 'X'.repeat(16), federalStateId: 'DE-HH' };

  it('allows a colleague of the same school', async () => {
    await expect(
      redeemVoucher({ ...base, userId: 'b', userRole: 'teacher', schoolIds: ['s1', 's2'] }),
    ).resolves.toEqual({ id: 'v1' });
  });

  it('rejects redemption by the donor', async () => {
    await expect(
      redeemVoucher({ ...base, userId: 'a', userRole: 'teacher', schoolIds: ['s1'] }),
    ).rejects.toThrow(/own/);
    expect(mocks.dbRedeemVoucher).not.toHaveBeenCalled();
  });

  it('rejects other schools and students', async () => {
    await expect(
      redeemVoucher({ ...base, userId: 'b', userRole: 'teacher', schoolIds: ['s9'] }),
    ).rejects.toThrow(/same school/);
    await expect(
      redeemVoucher({ ...base, userId: 'b', userRole: 'student', schoolIds: ['s1'] }),
    ).rejects.toThrow(/teachers/);
  });

  it('keeps regular admin vouchers redeemable unchanged', async () => {
    mocks.dbGetVoucherByCode.mockResolvedValue({ createdBy: 'Admin Name' });
    await expect(redeemVoucher({ ...base, userId: 'b' })).resolves.toEqual({ id: 'v1' });
    expect(mocks.dbGetUserById).not.toHaveBeenCalled();
  });
});
