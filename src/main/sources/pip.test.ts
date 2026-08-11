import { describe, it, expect } from 'vitest';
import { toPipPackages } from './pip';

// Verbatim from `pip3 list --outdated --format=json` on a real machine.
const REAL = JSON.parse(
  '[{"name": "packaging", "version": "26.1", "latest_version": "26.3", "latest_filetype": "wheel"},' +
    ' {"name": "pip", "version": "26.1.2", "latest_version": "26.2.1", "latest_filetype": "wheel"}]'
);

describe('toPipPackages', () => {
  it("maps pip's own field names onto the shared shape", () => {
    expect(toPipPackages(REAL)).toEqual([
      {
        sourceId: 'pip',
        name: 'packaging',
        installedVersion: '26.1',
        latestVersion: '26.3',
        status: 'outdated'
      },
      {
        sourceId: 'pip',
        name: 'pip',
        installedVersion: '26.1.2',
        latestVersion: '26.2.1',
        status: 'outdated'
      }
    ]);
  });

  it('returns nothing when everything is current', () => {
    expect(toPipPackages([])).toEqual([]);
  });

  it('reads `unknown` if pip omits the latest version', () => {
    const [p] = toPipPackages([{ name: 'thing', version: '1.0' }]);
    expect(p).toMatchObject({ latestVersion: '', status: 'unknown' });
  });

  it('does not claim outdated when the versions match', () => {
    const [p] = toPipPackages([{ name: 'thing', version: '1.0', latest_version: '1.0' }]);
    expect(p.status).toBe('current');
  });

  it('skips entries with no usable name', () => {
    expect(toPipPackages([{ version: '1.0' }, { name: '  ' }])).toEqual([]);
  });

  it('sorts by package name', () => {
    const names = toPipPackages([
      { name: 'zope', version: '1', latest_version: '2' },
      { name: 'attrs', version: '1', latest_version: '2' }
    ]).map((p) => p.name);
    expect(names).toEqual(['attrs', 'zope']);
  });
});
