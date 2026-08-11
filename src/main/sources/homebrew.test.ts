import { describe, it, expect } from 'vitest';
import { toFormulaPackages } from './homebrew';

const formula = (over: Partial<Parameters<typeof toFormulaPackages>[0][number]> = {}): Parameters<
  typeof toFormulaPackages
>[0][number] => ({
  name: 'ripgrep',
  desc: 'Search tool',
  versions: { stable: '14.1.1' },
  installed: [{ version: '14.1.1' }],
  outdated: false,
  pinned: false,
  ...over
});


describe('toFormulaPackages', () => {
  it('maps an up-to-date formula to `current` with no badges', () => {
    const [p] = toFormulaPackages([formula()]);
    expect(p).toMatchObject({
      sourceId: 'homebrew-formula',
      name: 'ripgrep',
      installedVersion: '14.1.1',
      latestVersion: '14.1.1',
      status: 'current',
      badges: undefined
    });
  });

  it('marks an outdated formula', () => {
    const [p] = toFormulaPackages([
      formula({ outdated: true, installed: [{ version: '14.0.0' }] })
    ]);
    expect(p.status).toBe('outdated');
  });

  it('marks a pinned, current formula as held', () => {
    const [p] = toFormulaPackages([formula({ pinned: true })]);
    expect(p.status).toBe('held');
    expect(p.badges).toBeUndefined();
  });

  it('leads with outdated when a formula is both pinned and outdated, keeping the pin as a badge', () => {
    const [p] = toFormulaPackages([formula({ pinned: true, outdated: true })]);
    expect(p.status).toBe('outdated');
    expect(p.badges).toEqual([
      { label: 'pinned', tone: 'muted', title: 'Held by `brew pin`' }
    ]);
  });

  it('reads `unknown` when brew has no stable version', () => {
    const [p] = toFormulaPackages([formula({ versions: { stable: null } })]);
    expect(p.status).toBe('unknown');
    expect(p.latestVersion).toBe('');
  });

  it('sorts by name', () => {
    const names = toFormulaPackages([
      formula({ name: 'zstd' }),
      formula({ name: 'aria2' }),
      formula({ name: 'moreutils' })
    ]).map((p) => p.name);
    expect(names).toEqual(['aria2', 'moreutils', 'zstd']);
  });
});
