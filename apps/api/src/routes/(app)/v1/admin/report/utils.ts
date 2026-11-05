import { ApiKeyModel, getUsageInCentByApiKeyId, ProjectModel } from '@ais-chat/api-database';
import { logger } from '@/logger';

type CostReportRow = {
  // e.g. January 2024
  interval: string;
  project: string;
  apiKey: string;
  limitInCent: number;
  usageInCent: number;
};

export async function createMonthlyCostReports({
  projects,
  year,
  months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}: {
  projects: { project: ProjectModel; apiKeys: ApiKeyModel[] }[];
  year: number;
  months?: number[];
}): Promise<CostReportRow[]> {
  const result: CostReportRow[] = [];

  for (const { project, apiKeys } of projects) {
    for (const apiKey of apiKeys) {
      for (const month of months) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const intervalName = startDate.toLocaleString('en-US', {
          month: 'long',
          year: 'numeric',
        });
        try {
          const { actualPrice } = await getUsageInCentByApiKeyId({
            apiKeyId: apiKey.id,
            startDate,
            endDate,
          });

          result.push({
            interval: intervalName,
            project: project.name,
            apiKey: apiKey.name,
            limitInCent: apiKey.limitInCent,
            usageInCent: actualPrice,
          });
        } catch (err) {
          logger.error(
            { err, apiKeyId: apiKey.id, intervalName },
            `Error getting usage for API key in interval`,
          );
          result.push({
            interval: intervalName,
            project: project.name,
            apiKey: apiKey.name,
            limitInCent: apiKey.limitInCent,
            usageInCent: 0,
          });
        }
      }
    }
  }

  return result;
}

export function convertToCSV(costReports: CostReportRow[]): string {
  const header = 'Zeitraum,Bundesland,API-Key,Limit,Verbrauch';
  const rows = costReports.map((row) => {
    // Convert cents to euros with 2 decimal places
    const limitInEuros = (row.limitInCent / 100).toFixed(2);
    const usageInEuros = (row.usageInCent / 100).toFixed(2);

    return `${row.interval},${escapeCSV(row.project)},${escapeCSV(row.apiKey)},${limitInEuros},${usageInEuros}`;
  });
  // Combine header and rows
  return [header, ...rows].join('\n');
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    // Escape quotes by doubling them and wrap in quotes
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
