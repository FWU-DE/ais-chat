import { getStartOfCurrentMonth } from '../utils/date';

export type BudgetRenewal = {
  renewsAt: Date;
  daysUntilRenewal: number;
};

/** Uses the server-local calendar month, matching the usage accounting boundary. */
export function getBudgetRenewal(now: Date = new Date()): BudgetRenewal {
  const renewsAt = getStartOfCurrentMonth(now);
  renewsAt.setMonth(renewsAt.getMonth() + 1);

  // Compare calendar dates rather than elapsed hours so DST does not change the count.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const renewalDay = Date.UTC(renewsAt.getFullYear(), renewsAt.getMonth(), renewsAt.getDate());

  return {
    renewsAt,
    daysUntilRenewal: (renewalDay - today) / (24 * 60 * 60 * 1000),
  };
}
