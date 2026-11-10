import { NotFoundError } from '@shared/error';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InfoBanner } from './info-banner';
import {
  createInfoBanner,
  deleteInfoBanner,
  getActiveBannersForUser,
  trackInfoBannerView,
  updateInfoBanner,
} from './info-banner-service';

const {
  mockDbOrderBy,
  mockDbWhere,
  mockDbLeftJoin,
  mockDbInnerJoin,
  mockDbSelect,
  mockDbInsertOnConflictDoUpdate,
  mockDbInsertValues,
  mockDbInsert,
  mockDbUpdateReturning,
  mockDbUpdate,
  mockTxInsertReturning,
  mockTxInsertValues,
  mockTxInsert,
  mockTxDeleteWhere,
  mockTxUpdateReturning,
  mockDbTransaction,
} = vi.hoisted(() => {
  const mockDbOrderBy = vi.fn();
  const mockDbWhere = vi.fn(() => ({ orderBy: mockDbOrderBy }));
  const mockDbLeftJoin = vi.fn(() => ({ where: mockDbWhere }));
  const mockDbInnerJoin = vi.fn(() => ({ leftJoin: mockDbLeftJoin, where: mockDbWhere }));
  const mockDbFrom = vi.fn(() => ({ innerJoin: mockDbInnerJoin, where: mockDbWhere }));
  const mockDbSelect = vi.fn(() => ({ from: mockDbFrom }));

  const mockDbInsertOnConflictDoUpdate = vi.fn();
  const mockDbInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockDbInsertOnConflictDoUpdate }));
  const mockDbInsert = vi.fn(() => ({ values: mockDbInsertValues }));

  const mockDbUpdateReturning = vi.fn();
  const mockDbUpdateWhere = vi.fn(() => ({ returning: mockDbUpdateReturning }));
  const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));

  const mockTxInsertReturning = vi.fn();
  const mockTxInsertValues = vi.fn(() => ({ returning: mockTxInsertReturning }));
  const mockTxInsert = vi.fn(() => ({ values: mockTxInsertValues }));
  const mockTxDeleteWhere = vi.fn();
  const mockTxDelete = vi.fn(() => ({ where: mockTxDeleteWhere }));
  const mockTxUpdateReturning = vi.fn();
  const mockTxUpdateWhere = vi.fn(() => ({ returning: mockTxUpdateReturning }));
  const mockTxUpdateSet = vi.fn(() => ({ where: mockTxUpdateWhere }));
  const mockTxUpdate = vi.fn(() => ({ set: mockTxUpdateSet }));
  const mockDbTransaction = vi.fn(async (callback) =>
    callback({
      insert: mockTxInsert,
      delete: mockTxDelete,
      update: mockTxUpdate,
    }),
  );

  return {
    mockDbOrderBy,
    mockDbWhere,
    mockDbLeftJoin,
    mockDbInnerJoin,
    mockDbSelect,
    mockDbInsertOnConflictDoUpdate,
    mockDbInsertValues,
    mockDbInsert,
    mockDbUpdateReturning,
    mockDbUpdate,
    mockTxInsertReturning,
    mockTxInsertValues,
    mockTxInsert,
    mockTxDeleteWhere,
    mockTxDelete,
    mockTxUpdateReturning,
    mockTxUpdate,
    mockDbTransaction,
  };
});

vi.mock('@shared/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    transaction: mockDbTransaction,
  },
}));

const dialect = new PgDialect();
const fixedNow = new Date('2026-04-22T11:00:00.000Z');

function getRequiredMockCall<T extends unknown[]>(
  calls: ReadonlyArray<ReadonlyArray<unknown>>,
  index: number,
  label: string,
): T {
  const call = calls[index];
  if (!call) {
    throw new Error(`Expected ${label} call ${index + 1} to exist`);
  }

  return call as T;
}

function buildInfoBanner(overrides: Partial<InfoBanner> = {}): InfoBanner {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'info' as const,
    message: 'Hinweis',
    buttonLabel: null,
    buttonUrl: null,
    startsAt: new Date('2026-04-20T00:00:00.000Z'),
    endsAt: new Date('2026-04-30T00:00:00.000Z'),
    maxLoginCount: null,
    createdAt: new Date('2026-04-19T00:00:00.000Z'),
    updatedAt: new Date('2026-04-19T00:00:00.000Z'),
    isDeleted: false,
    ...overrides,
  };
}

describe('info-banner-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters active banners for a user and orders warnings before info banners', async () => {
    const warningBanner = buildInfoBanner({
      id: '00000000-0000-4000-8000-000000000002',
      type: 'warning',
      message: 'Warnung',
      startsAt: new Date('2026-04-21T00:00:00.000Z'),
    });
    const infoBanner = buildInfoBanner();
    mockDbOrderBy.mockResolvedValue([warningBanner, infoBanner]);

    const result = await getActiveBannersForUser({
      federalStateId: 'BY',
      userId: '00000000-0000-4000-8000-000000000099',
    });

    expect(result).toEqual([warningBanner, infoBanner]);
    expect(mockDbInnerJoin).toHaveBeenCalledOnce();
    expect(mockDbLeftJoin).toHaveBeenCalledOnce();

    const [, leftJoinClause] = getRequiredMockCall<[unknown, SQL]>(
      mockDbLeftJoin.mock.calls,
      0,
      'leftJoin',
    );
    const leftJoinQuery = dialect.sqlToQuery(leftJoinClause);
    expect(leftJoinQuery.sql).toContain(
      '"info_banner_user_state"."info_banner_id" = "info_banner"."id"',
    );
    expect(leftJoinQuery.sql).toContain('"info_banner_user_state"."user_id" = $1');
    expect(leftJoinQuery.params).toEqual(['00000000-0000-4000-8000-000000000099']);

    const [whereClause] = getRequiredMockCall<[SQL]>(mockDbWhere.mock.calls, 0, 'where');
    const whereQuery = dialect.sqlToQuery(whereClause);
    expect(whereQuery.sql).toContain('"info_banner_federal_state_mapping"."federal_state_id" = $1');
    expect(whereQuery.sql).toContain('"info_banner"."is_deleted" = $2');
    expect(whereQuery.sql).toContain('"info_banner"."starts_at" <= $3');
    expect(whereQuery.sql).toContain('"info_banner"."ends_at" > $4');
    expect(whereQuery.sql).toContain(
      '("info_banner"."max_login_count" is null or coalesce("info_banner_user_state"."login_count", 0) < "info_banner"."max_login_count")',
    );
    expect(whereQuery.params).toEqual([
      'BY',
      false,
      fixedNow.toISOString(),
      fixedNow.toISOString(),
    ]);

    const [typeOrder, startsAtOrder, createdAtOrder] = getRequiredMockCall<[SQL, SQL, SQL]>(
      mockDbOrderBy.mock.calls,
      0,
      'orderBy',
    );
    expect(dialect.sqlToQuery(typeOrder).sql).toContain(
      `case when "info_banner"."type" = 'warning' then 0 else 1 end`,
    );
    expect(dialect.sqlToQuery(startsAtOrder).sql).toContain('"info_banner"."starts_at" desc');
    expect(dialect.sqlToQuery(createdAtOrder).sql).toContain('"info_banner"."created_at" desc');
  });

  it('tracks a banner view per user and increments the existing counter on conflict', async () => {
    await trackInfoBannerView({
      infoBannerId: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000011',
    });

    expect(mockDbInsert).toHaveBeenCalledOnce();
    const [insertValues] = getRequiredMockCall<
      [{ infoBannerId: string; userId: string; loginCount: number }]
    >(mockDbInsertValues.mock.calls, 0, 'insert values');
    expect(insertValues).toEqual({
      infoBannerId: '00000000-0000-4000-8000-000000000010',
      userId: '00000000-0000-4000-8000-000000000011',
      loginCount: 1,
    });

    const [conflictConfig] = getRequiredMockCall<
      [
        {
          target: unknown[];
          set: { loginCount: SQL };
        },
      ]
    >(mockDbInsertOnConflictDoUpdate.mock.calls, 0, 'onConflictDoUpdate');
    expect(conflictConfig.target).toHaveLength(2);
    expect(dialect.sqlToQuery(conflictConfig.set.loginCount).sql).toContain(
      '"info_banner_user_state"."login_count" + 1',
    );
  });

  it('creates an info banner with mapped federal states only', async () => {
    const createdInfoBanner = buildInfoBanner();
    mockTxInsertReturning.mockResolvedValue([createdInfoBanner]);

    const result = await createInfoBanner(
      {
        type: 'info',
        message: 'Hinweis',
        buttonLabel: null,
        buttonUrl: null,
        startsAt: new Date('2026-04-20T00:00:00.000Z'),
        endsAt: new Date('2026-04-30T00:00:00.000Z'),
        maxLoginCount: null,
      },
      [
        { federalStateId: 'BY', isMapped: true },
        { federalStateId: 'BW', isMapped: false },
        { federalStateId: 'BE', isMapped: true },
      ],
    );

    expect(result).toEqual(createdInfoBanner);
    expect(mockDbTransaction).toHaveBeenCalledOnce();
    expect(mockTxInsert).toHaveBeenCalledTimes(2);
    const [createdMappings] = getRequiredMockCall<
      [Array<{ infoBannerId: string; federalStateId: string }>]
    >(mockTxInsertValues.mock.calls, 1, 'insert values');
    expect(createdMappings).toEqual([
      { infoBannerId: createdInfoBanner.id, federalStateId: 'BY' },
      { infoBannerId: createdInfoBanner.id, federalStateId: 'BE' },
    ]);
  });

  it('updates an info banner and replaces its federal state mappings', async () => {
    const updatedInfoBanner = buildInfoBanner({
      id: '00000000-0000-4000-8000-000000000003',
      message: 'Aktualisiert',
    });
    mockTxUpdateReturning.mockResolvedValue([updatedInfoBanner]);

    const result = await updateInfoBanner(
      updatedInfoBanner.id,
      {
        type: 'warning',
        message: 'Aktualisiert',
        buttonLabel: null,
        buttonUrl: null,
        startsAt: new Date('2026-04-20T00:00:00.000Z'),
        endsAt: new Date('2026-04-30T00:00:00.000Z'),
        maxLoginCount: 5,
      },
      [
        { federalStateId: 'BY', isMapped: false },
        { federalStateId: 'BW', isMapped: true },
      ],
    );

    expect(result).toEqual(updatedInfoBanner);
    expect(mockTxDeleteWhere).toHaveBeenCalledOnce();
    const [updatedMappings] = getRequiredMockCall<
      [Array<{ infoBannerId: string; federalStateId: string }>]
    >(mockTxInsertValues.mock.calls, 0, 'insert values');
    expect(updatedMappings).toEqual([{ infoBannerId: updatedInfoBanner.id, federalStateId: 'BW' }]);
  });

  it('throws NotFoundError when deleting an unknown info banner', async () => {
    mockDbUpdateReturning.mockResolvedValue([]);

    await expect(deleteInfoBanner('00000000-0000-4000-8000-000000000004')).rejects.toThrow(
      NotFoundError,
    );
  });
});
