import { describe, it, expect } from 'vitest';
import { mergePnpmGlobals } from './pnpmGlobals';
import { parseYarnGlobalList } from './yarnGlobals';
import { parseBunOutdated } from './bunGlobals';

describe('mergePnpmGlobals', () => {
  // Verbatim shapes from `pnpm ls -g --json` and `pnpm outdated -g --format=json`
  // (pnpm 11.21.0).
  const LS = [
    { path: '/…/global/v11', private: true, dependencies: { cowsay: { version: '1.4.0' } } }
  ];
  const OUTDATED = { cowsay: { current: '1.4.0', latest: '1.6.0', wanted: '1.4.0' } };

  it('overlays the outdated report onto the full global list', () => {
    expect(mergePnpmGlobals(LS, OUTDATED)).toEqual([
      {
        sourceId: 'pnpm-global',
        name: 'cowsay',
        installedVersion: '1.4.0',
        latestVersion: '1.6.0',
        status: 'outdated'
      }
    ]);
  });

  it('keeps current packages, so the tab shows everything installed', () => {
    const [p] = mergePnpmGlobals(LS, {});
    expect(p).toMatchObject({
      installedVersion: '1.4.0',
      latestVersion: '1.4.0',
      status: 'current'
    });
  });

  it('merges dependencies across multiple roots', () => {
    const rows = mergePnpmGlobals(
      [{ dependencies: { a: { version: '1.0' } } }, { dependencies: { b: { version: '2.0' } } }],
      {}
    );
    expect(rows.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('handles an empty global root', () => {
    expect(mergePnpmGlobals([], {})).toEqual([]);
    expect(mergePnpmGlobals([{}], {})).toEqual([]);
  });
});

describe('parseYarnGlobalList', () => {
  // Verbatim from `yarn global list` (yarn 1.22.22).
  const REAL = `yarn global v1.22.22
info "cowsay@1.4.0" has binaries:
   - cowsay
   - cowthink
Done in 0.05s.`;

  it('reads name and version from the info lines', () => {
    expect(parseYarnGlobalList(REAL)).toEqual([{ name: 'cowsay', version: '1.4.0' }]);
  });

  it('ignores the banner, binary and timing lines', () => {
    expect(parseYarnGlobalList(REAL)).toHaveLength(1);
  });

  it('splits a scoped package on the last @, keeping the leading one', () => {
    const out = 'info "@angular/cli@17.3.0" has binaries:\n   - ng';
    expect(parseYarnGlobalList(out)).toEqual([{ name: '@angular/cli', version: '17.3.0' }]);
  });

  it('returns nothing when no globals are installed', () => {
    expect(parseYarnGlobalList('yarn global v1.22.22\nDone in 0.04s.')).toEqual([]);
  });
});

describe('parseBunOutdated', () => {
  // Verbatim from `bun outdated --global` (bun 1.3.14).
  const REAL = `bun outdated v1.3.14 (0d9b296a)
|--------------------------------------|
| Package  | Current | Update | Latest |
|----------|---------|--------|--------|
| cowsay   | 1.4.0   | 1.4.0  | 1.6.0  |
|----------|---------|--------|--------|
| semver   | 7.0.0   | 7.0.0  | 7.8.5  |
|--------------------------------------|`;

  it('reads the data rows out of the ASCII table', () => {
    expect(parseBunOutdated(REAL)).toEqual([
      {
        sourceId: 'bun-global',
        name: 'cowsay',
        installedVersion: '1.4.0',
        latestVersion: '1.6.0',
        status: 'outdated'
      },
      {
        sourceId: 'bun-global',
        name: 'semver',
        installedVersion: '7.0.0',
        latestVersion: '7.8.5',
        status: 'outdated'
      }
    ]);
  });

  it('excludes the header row — "Current" is not a version', () => {
    expect(parseBunOutdated(REAL).map((p) => p.name)).not.toContain('Package');
  });

  it('excludes the |----| rule rows', () => {
    expect(parseBunOutdated(REAL)).toHaveLength(2);
  });

  it('returns nothing when everything is current', () => {
    expect(parseBunOutdated('bun outdated v1.3.14 (0d9b296a)\n')).toEqual([]);
    expect(parseBunOutdated('')).toEqual([]);
  });

  it('handles a scoped package name', () => {
    const out = '| @scope/pkg | 1.0.0 | 1.0.0 | 2.0.0 |';
    expect(parseBunOutdated(out)[0]).toMatchObject({ name: '@scope/pkg', latestVersion: '2.0.0' });
  });
});
