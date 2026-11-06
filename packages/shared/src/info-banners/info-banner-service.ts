import { db } from '@shared/db';
import {
  federalStateTable,
  infoBannerFederalStateMappingTable,
  infoBannerTable,
  infoBannerUserStateTable,
} from '@shared/db/schema';
import { InvalidArgumentError, NotFoundError } from '@shared/error';
import {
  InfoBanner,
  infoBannerSchema,
  InfoBannerToFederalStateMapping,
  infoBannerToFederalStateMappingSchema,
  type ManageInfoBannerInput,
  manageInfoBannerSchema,
} from '@shared/info-banners/info-banner';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';

function getMappedFederalStateIds(mappings: InfoBannerToFederalStateMapping[]): string[] {
  const parsedMappings = infoBannerToFederalStateMappingSchema.array().parse(mappings);
  const federalStateIds = parsedMappings
    .filter((mapping) => mapping.isMapped)
    .map((mapping) => mapping.federalStateId);

  if (federalStateIds.length === 0) {
    throw new InvalidArgumentError('At least one federal state mapping is required');
  }

  return federalStateIds;
}

export async function getInfoBanners(): Promise<InfoBanner[]> {
  const infoBanners = await db
    .select({ ...getTableColumns(infoBannerTable) })
    .from(infoBannerTable)
    .where(eq(infoBannerTable.isDeleted, false))
    .orderBy(
      asc(sql`case when ${infoBannerTable.type} = 'warning' then 0 else 1 end`),
      desc(infoBannerTable.startsAt),
      desc(infoBannerTable.createdAt),
    );

  return infoBannerSchema.array().parse(infoBanners);
}

export async function getInfoBannerById(infoBannerId: string): Promise<InfoBanner> {
  const [infoBanner] = await db
    .select({ ...getTableColumns(infoBannerTable) })
    .from(infoBannerTable)
    .where(and(eq(infoBannerTable.id, infoBannerId), eq(infoBannerTable.isDeleted, false)));

  if (!infoBanner) {
    throw new NotFoundError('Info banner not found');
  }

  return infoBannerSchema.parse(infoBanner);
}

export async function getFederalStatesWithInfoBannerMappings(
  infoBannerId: string,
): Promise<InfoBannerToFederalStateMapping[]> {
  const subquery = db
    .select({
      federalStateId: infoBannerFederalStateMappingTable.federalStateId,
      infoBannerId: infoBannerFederalStateMappingTable.infoBannerId,
    })
    .from(infoBannerFederalStateMappingTable)
    .where(eq(infoBannerFederalStateMappingTable.infoBannerId, infoBannerId))
    .as('mapping');

  const mappings = await db
    .select({ federalStateId: federalStateTable.id, infoBannerId: subquery.infoBannerId })
    .from(federalStateTable)
    .leftJoin(subquery, eq(subquery.federalStateId, federalStateTable.id))
    .orderBy(asc(federalStateTable.id));

  return mappings.map((mapping) => ({
    federalStateId: mapping.federalStateId,
    isMapped: mapping.infoBannerId !== null,
  }));
}

export async function createInfoBanner(
  input: ManageInfoBannerInput,
  mappings: InfoBannerToFederalStateMapping[],
): Promise<InfoBanner> {
  const values = manageInfoBannerSchema.parse(input);
  const federalStateIds = getMappedFederalStateIds(mappings);

  return await db.transaction(async (tx) => {
    const [createdInfoBanner] = await tx.insert(infoBannerTable).values(values).returning();

    if (!createdInfoBanner) {
      throw new Error('Failed to create info banner');
    }

    await tx.insert(infoBannerFederalStateMappingTable).values(
      federalStateIds.map((federalStateId) => ({
        infoBannerId: createdInfoBanner.id,
        federalStateId,
      })),
    );

    return infoBannerSchema.parse(createdInfoBanner);
  });
}

export async function updateInfoBanner(
  infoBannerId: string,
  input: ManageInfoBannerInput,
  mappings: InfoBannerToFederalStateMapping[],
): Promise<InfoBanner> {
  const values = manageInfoBannerSchema.parse(input);
  const federalStateIds = getMappedFederalStateIds(mappings);

  return await db.transaction(async (tx) => {
    const [updatedInfoBanner] = await tx
      .update(infoBannerTable)
      .set(values)
      .where(and(eq(infoBannerTable.id, infoBannerId), eq(infoBannerTable.isDeleted, false)))
      .returning();

    if (!updatedInfoBanner) {
      throw new NotFoundError('Info banner not found');
    }

    await tx
      .delete(infoBannerFederalStateMappingTable)
      .where(eq(infoBannerFederalStateMappingTable.infoBannerId, infoBannerId));

    await tx.insert(infoBannerFederalStateMappingTable).values(
      federalStateIds.map((federalStateId) => ({
        infoBannerId,
        federalStateId,
      })),
    );

    return infoBannerSchema.parse(updatedInfoBanner);
  });
}

export async function deleteInfoBanner(infoBannerId: string): Promise<void> {
  const [deletedInfoBanner] = await db
    .update(infoBannerTable)
    .set({ isDeleted: true })
    .where(and(eq(infoBannerTable.id, infoBannerId), eq(infoBannerTable.isDeleted, false)))
    .returning({ id: infoBannerTable.id });

  if (!deletedInfoBanner) {
    throw new NotFoundError('Info banner not found');
  }
}

export async function getActiveBannersForUser({
  federalStateId,
  userId,
}: {
  federalStateId: string;
  userId: string;
}): Promise<InfoBanner[]> {
  const now = new Date();

  const infoBanners = await db
    .select({ ...getTableColumns(infoBannerTable) })
    .from(infoBannerTable)
    .innerJoin(
      infoBannerFederalStateMappingTable,
      eq(infoBannerFederalStateMappingTable.infoBannerId, infoBannerTable.id),
    )
    .leftJoin(
      infoBannerUserStateTable,
      and(
        eq(infoBannerUserStateTable.infoBannerId, infoBannerTable.id),
        eq(infoBannerUserStateTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(infoBannerFederalStateMappingTable.federalStateId, federalStateId),
        eq(infoBannerTable.isDeleted, false),
        lte(infoBannerTable.startsAt, now),
        gt(infoBannerTable.endsAt, now),
        or(
          isNull(infoBannerTable.maxLoginCount),
          sql`coalesce(${infoBannerUserStateTable.loginCount}, 0) < ${infoBannerTable.maxLoginCount}`,
        ),
      ),
    )
    .orderBy(
      asc(sql`case when ${infoBannerTable.type} = 'warning' then 0 else 1 end`),
      desc(infoBannerTable.startsAt),
      desc(infoBannerTable.createdAt),
    );

  return infoBannerSchema.array().parse(infoBanners);
}

export async function trackInfoBannerView({
  infoBannerId,
  userId,
}: {
  infoBannerId: string;
  userId: string;
}): Promise<void> {
  await db
    .insert(infoBannerUserStateTable)
    .values({
      infoBannerId,
      userId,
      loginCount: 1,
    })
    .onConflictDoUpdate({
      target: [infoBannerUserStateTable.infoBannerId, infoBannerUserStateTable.userId],
      set: {
        loginCount: sql`${infoBannerUserStateTable.loginCount} + 1`,
      },
    });
}

export async function getInfoBannersByIds(infoBannerIds: string[]): Promise<InfoBanner[]> {
  if (infoBannerIds.length === 0) {
    return [];
  }

  const infoBanners = await db
    .select({ ...getTableColumns(infoBannerTable) })
    .from(infoBannerTable)
    .where(inArray(infoBannerTable.id, infoBannerIds));

  return infoBannerSchema.array().parse(infoBanners);
}
