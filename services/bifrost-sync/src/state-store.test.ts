import { mkdtempSync, rmSync } from 'node:fs';
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
