import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { FileStateStore, LockError } from './state-store';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'state-store-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('starts idle and persists writes across instances', async () => {
  const path = join(dir, 'state.json');
  const store = new FileStateStore(path);
  const { state, version } = await store.read();
  expect(state).toEqual({ phase: 'idle' });

  await store.write({ phase: 'restarting', lastSyncedHash: 'h' }, version);

  expect((await new FileStateStore(path).read()).state).toEqual({
    phase: 'restarting',
    lastSyncedHash: 'h',
  });
});

test('rejects a write against an outdated version', async () => {
  const store = new FileStateStore(join(dir, 'state.json'));
  const { version } = await store.read();
  await store.write({ phase: 'syncing' }, version);

  await expect(store.write({ phase: 'syncing' }, version)).rejects.toBeInstanceOf(LockError);
});

test('a read during a write sees the old state with the old version, or the new with the new', async () => {
  const store = new FileStateStore(join(dir, 'state.json'));
  const { version } = await store.read();

  const write = store.write({ phase: 'syncing', lastSyncedHash: 'new' }, version);
  const read = store.read();
  const [newVersion, seen] = await Promise.all([write, read]);

  if (seen.version === version) expect(seen.state.phase).toBe('idle');
  else expect(seen.state.lastSyncedHash).toBe('new');
  expect(newVersion).not.toBe(version);
});

test('parallel writes against one version let exactly one through and keep the file intact', async () => {
  const path = join(dir, 'state.json');
  const store = new FileStateStore(path);
  const { version } = await store.read();

  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      store.write({ phase: 'syncing', lastSyncedHash: `w${i}` }, version),
    ),
  );

  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  expect(rejected).toHaveLength(7);
  // Losers fail on the lock, not on a shared temp file that another write already renamed.
  for (const { reason } of rejected) expect(reason).toBeInstanceOf(LockError);
  const stored = (await new FileStateStore(path).read()).state;
  expect(stored.lastSyncedHash).toMatch(/^w\d$/);
});

test('a failed write does not advance the version', async () => {
  // A file in place of a directory makes every write fail with ENOTDIR.
  const blocker = join(dir, 'blocker');
  writeFileSync(blocker, 'x');
  const path = join(blocker, 'state.json');
  const store = new FileStateStore(path);

  await expect(store.write({ phase: 'syncing' }, '0')).rejects.toThrow();

  // Version 0 is still current: a second write against it fails for the same reason, not as LockError.
  await expect(store.write({ phase: 'syncing' }, '0')).rejects.not.toBeInstanceOf(LockError);
});
