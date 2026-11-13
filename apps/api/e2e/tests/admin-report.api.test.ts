import { expect, test } from '@playwright/test';

const ADMIN_API_KEY = process.env.API_KEY;

if (!ADMIN_API_KEY) {
  throw new Error('API_KEY environment variable is required. Set it in apps/api/.env.test');
}

const adminHeader = { Authorization: `Bearer ${ADMIN_API_KEY}` };
const year = new Date().getFullYear();
const path = `/v1/admin/report/${year}`;

test.describe(`GET ${path}`, { tag: '@smoke' }, () => {
  test('returns 401 without authentication', async ({ request }) => {
    const response = await request.get(path);

    expect(response.status()).toBe(401);
  });

  test('returns 401 with an invalid admin key', async ({ request }) => {
    const response = await request.get(path, { headers: { Authorization: 'Bearer invalid' } });

    expect(response.status()).toBe(401);
  });

  test('returns the cost report as json', async ({ request }) => {
    const response = await request.get(path, { headers: adminHeader });

    expect(response.status()).toBe(200);
    const { report } = await response.json();
    expect(Array.isArray(report)).toBe(true);
    expect(report.length).toBeGreaterThan(0);
    expect(report[0]).toEqual({
      interval: expect.any(String),
      project: expect.any(String),
      apiKey: expect.any(String),
      limitInCent: expect.any(Number),
      usageInCent: expect.any(Number),
    });
  });

  test('returns the cost report as csv', async ({ request }) => {
    const response = await request.get(`${path}?format=csv`, { headers: adminHeader });

    expect(response.status()).toBe(200);
    const [header, ...rows] = (await response.text()).split('\n');
    expect(header).toBe('Zeitraum,Bundesland,API-Key,Limit,Verbrauch');
    expect(rows.length).toBeGreaterThan(0);
  });
});
