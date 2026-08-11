import { describe, it, expect } from 'vitest';
import { toComposerPackages } from './composer';

// Verbatim from `composer global outdated --format=json` (Composer 2.x).
const REAL = {
  installed: [
    {
      name: 'psr/log',
      'direct-dependency': true,
      version: '1.1.0',
      'release-age': '7 years old',
      latest: '3.0.2',
      'latest-status': 'update-possible',
      description: 'Common interface for logging libraries',
      abandoned: false
    }
  ]
};

describe('toComposerPackages', () => {
  it('reads name, version and latest from the nested installed array', () => {
    expect(toComposerPackages(REAL)).toEqual([
      {
        sourceId: 'composer',
        name: 'psr/log',
        description: 'Common interface for logging libraries',
        installedVersion: '1.1.0',
        latestVersion: '3.0.2',
        status: 'outdated'
      }
    ]);
  });

  it('does not claim outdated when installed already equals latest', () => {
    const [p] = toComposerPackages({
      installed: [{ name: 'psr/log', version: '3.0.2', latest: '3.0.2' }]
    });
    expect(p.status).toBe('current');
  });

  it('reads `unknown` when composer reports no latest', () => {
    const [p] = toComposerPackages({ installed: [{ name: 'acme/pkg', version: '1.0.0' }] });
    expect(p).toMatchObject({ latestVersion: '', status: 'unknown' });
  });

  it('handles the empty case', () => {
    expect(toComposerPackages({ installed: [] })).toEqual([]);
    expect(toComposerPackages({})).toEqual([]);
  });

  it('skips entries with no name', () => {
    expect(toComposerPackages({ installed: [{ version: '1.0' }] })).toEqual([]);
  });

  it('sorts by vendor/package name', () => {
    const names = toComposerPackages({
      installed: [
        { name: 'zend/z', version: '1', latest: '2' },
        { name: 'acme/a', version: '1', latest: '2' }
      ]
    }).map((p) => p.name);
    expect(names).toEqual(['acme/a', 'zend/z']);
  });
});
