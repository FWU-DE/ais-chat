import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

type DrizzleMigrationJournal = {
  entries: Array<{
    idx: number;
    when: number;
    tag: string;
  }>;
};

/**
 * Tests for Drizzle migration journal validation
 *
 * Drizzle ORM < 1.0.0 uses a "high water mark" approach - it tracks the most recent migration
 * timestamp applied and skips migrations with earlier timestamps. If parallel branches create
 * migrations with non-ascending timestamps, some migrations will be silently skipped after merge.
 *
 * This test can be removed after upgrading to Drizzle ORM 1.0.0, which fixes the ordering logic.
 */
describe('Drizzle Migration Journal - Shared Database', () => {
  test('should have strictly ascending idx and timestamps', () => {
    const journalPath = resolve(__dirname, '../../migrations/meta/_journal.json');
    const journalContent = readFileSync(journalPath, 'utf-8');
    const journal = JSON.parse(journalContent) as DrizzleMigrationJournal;

    for (let i = 1; i < journal.entries.length; i++) {
      const currentEntry = journal.entries[i]!;
      const prevEntry = journal.entries[i - 1]!;

      expect
        .soft(
          currentEntry.idx,
          `idx at position ${i} (${currentEntry.idx}) must be > ${prevEntry.idx}`,
        )
        .toBeGreaterThan(prevEntry.idx);
      expect
        .soft(
          currentEntry.when,
          `timestamp at position ${i} (${currentEntry.when}) must be > ${prevEntry.when}`,
        )
        .toBeGreaterThan(prevEntry.when);
    }
  });

  test('should have a continuous snapshot chain', () => {
    const metaPath = resolve(__dirname, '../../migrations/meta');
    const journal = JSON.parse(
      readFileSync(resolve(metaPath, '_journal.json'), 'utf-8'),
    ) as DrizzleMigrationJournal;

    let prev: { name: string; id: string } | undefined;
    for (const { tag } of journal.entries) {
      const name = tag.slice(0, 4);
      const snapshot = JSON.parse(
        readFileSync(resolve(metaPath, `${name}_snapshot.json`), 'utf-8'),
      ) as { id: string; prevId: string };

      if (prev) {
        expect.soft(snapshot.prevId, `${name} prevId must equal id of ${prev.name}`).toBe(prev.id);
      }
      prev = { name, id: snapshot.id };
    }
  });
});
