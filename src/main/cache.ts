import { app } from 'electron';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from './jsonStore';
import type { Snapshot } from '../shared/types';

const FILENAME = 'snapshot.json';
const SCHEMA = 2;

function snapshotPath(): string {
  return join(app.getPath('userData'), FILENAME);
}

export async function readSnapshot(): Promise<Snapshot | null> {
  const parsed = await readJsonFile<Snapshot>(snapshotPath());
  // Schema 1 was one fixed field per ecosystem. Rather than migrate shapes for a
  // cache that a single Refresh rebuilds, drop it and start clean.
  if (!parsed || parsed.schema !== SCHEMA) return null;
  return parsed;
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await writeJsonAtomic(snapshotPath(), snapshot);
}
