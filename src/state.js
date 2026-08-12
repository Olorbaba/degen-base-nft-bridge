import fs from 'node:fs/promises';
import path from 'node:path';

const emptyState = (startBlock) => ({ version: 1, nextBlock: startBlock.toString(), transfers: {} });

export async function loadState(file, startBlock) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!parsed || parsed.version !== 1 || typeof parsed.transfers !== 'object') throw new Error('invalid state');
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Ignoring unreadable state file ${file}: ${error.message}`);
    return emptyState(startBlock);
  }
}

export async function saveState(file, state) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}

