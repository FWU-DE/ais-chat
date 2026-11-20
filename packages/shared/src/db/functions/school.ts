import { eq } from 'drizzle-orm';

import { db } from '..';
import { federalStateTable, userTable } from '../schema';

export async function dbGetUserAndFederalStateByUserId({ userId }: { userId: string }) {
  const [result] = await db
    .select({
      user: userTable,
      federalState: federalStateTable,
    })
    .from(userTable)
    .innerJoin(federalStateTable, eq(federalStateTable.id, userTable.federalStateId))
    .where(eq(userTable.id, userId));

  if (result === undefined) return undefined;

  return {
    user: result.user,
    federalState: result.federalState,
  };
}

export async function dbGetFederalStateByUserId({ userId }: { userId: string }) {
  const [result] = await db
    .select({ federalState: federalStateTable })
    .from(userTable)
    .innerJoin(federalStateTable, eq(federalStateTable.id, userTable.federalStateId))
    .where(eq(userTable.id, userId));

  return result?.federalState;
}
