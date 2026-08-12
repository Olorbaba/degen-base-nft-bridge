import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadState, saveState } from '../src/state.js';

test('state is persisted atomically and survives reload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-state-'));
  const file = path.join(dir, 'state.json');
  const state = await loadState(file, 123n);
  state.nextBlock = '456';
  state.transfers.example = { status: 'completed' };
  await saveState(file, state);
  assert.deepEqual(await loadState(file, 0n), state);
});

