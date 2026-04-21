import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot } from '../shared/types';

const FILENAME = 'snapshot.json';

function snapshotPath(): string {
  return join(app.getPath('userData'), FILENAME);
}

export async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(), 'utf8');
    return JSON.parse(raw) as Snapshot;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  const target = snapshotPath();
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.rename(tmp, target);
}
