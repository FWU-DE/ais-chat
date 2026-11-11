import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { describe, expect, test } from 'vitest';

import * as schema from './schema';

type DrizzleSnapshot = { id: string };

const META_PATH = resolve(__dirname, '../../migrations/meta');

function readLatestSnapshot() {
  const latest = readdirSync(META_PATH)
    .filter((file) => file.endsWith('_snapshot.json'))
    .sort()
    .at(-1)!;
  const snapshot = JSON.parse(readFileSync(resolve(META_PATH, latest), 'utf-8')) as DrizzleSnapshot;
  return { name: latest, snapshot };
}

/**
 * Tests that the latest Drizzle migration snapshot matches the TypeScript schema.
 */
describe('Drizzle Migration Snapshot - Shared Database', () => {
  /**
   * A schema change without a generated migration (or a snapshot edited by hand) makes the next
   * `drizzle-kit generate` emit unrelated SQL. Diffing the schema against the latest snapshot must
   * therefore produce no statements.
   */
  test('should match the schema', async () => {
    const { name, snapshot } = readLatestSnapshot();

    const statements = await generateMigration(snapshot, generateDrizzleJson(schema, snapshot.id));

    expect(
      statements,
      `${name} does not match the schema, run \`pnpm db:generate\` in packages/shared`,
    ).toEqual([]);
  });
});
