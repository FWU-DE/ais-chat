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

const META_PATH = resolve(__dirname, '../../migrations/meta');

function readJournal() {
  const journalContent = readFileSync(resolve(META_PATH, '_journal.json'), 'utf-8');
  return JSON.parse(journalContent) as DrizzleMigrationJournal;
}

/**
 * Tests for Drizzle migration metadata validation (journal and snapshots)
 */
describe('Drizzle Migration Journal - Shared Database', () => {
  /**
   * Drizzle ORM < 1.0.0 uses a "high water mark" approach - it tracks the most recent migration
   * timestamp applied and skips migrations with earlier timestamps. If parallel branches create
   * migrations with non-ascending timestamps, some migrations will be silently skipped after merge.
   *
   * This test can be removed after upgrading to Drizzle ORM 1.0.0, which fixes the ordering logic.
   */
  test('should have strictly ascending idx and timestamps', () => {
    const journal = readJournal();

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

  /**
   * Drizzle Kit diffs the schema against the latest snapshot and links each snapshot to its
   * predecessor via `prevId`. A broken chain (e.g. a snapshot generated from an edited or stale
   * baseline, or parallel branches sharing the same parent) makes later migrations inconsistent.
   */
  test('should have a continuous snapshot chain', () => {
    const journal = readJournal();

    let prev: { name: string; id: string } | undefined;
    for (const { tag } of journal.entries) {
      const name = tag.slice(0, 4);
      const snapshot = JSON.parse(
        readFileSync(resolve(META_PATH, `${name}_snapshot.json`), 'utf-8'),
      ) as { id: string; prevId: string };

      if (prev) {
        expect.soft(snapshot.prevId, `${name} prevId must equal id of ${prev.name}`).toBe(prev.id);
      }
      prev = { name, id: snapshot.id };
    }
  });
});
