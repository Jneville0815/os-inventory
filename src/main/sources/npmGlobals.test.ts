import { describe, it, expect } from 'vitest';
import { mergeNpmGlobals } from './npmGlobals';

describe('mergeNpmGlobals', () => {
  it('treats a package absent from `outdated` as current', () => {
    const [p] = mergeNpmGlobals({ dependencies: { npm: { version: '12.0.2' } } }, {});
    expect(p).toMatchObject({
      sourceId: 'npm-global',
      name: 'npm',
      installedVersion: '12.0.2',
      latestVersion: '12.0.2',
      status: 'current'
    });
  });

  it('overlays current and latest from `outdated`', () => {
    const [p] = mergeNpmGlobals(
      { dependencies: { typescript: { version: '5.8.0' } } },
      { typescript: { current: '5.8.0', wanted: '5.9.3', latest: '5.9.3' } }
    );
    expect(p).toMatchObject({
      installedVersion: '5.8.0',
      latestVersion: '5.9.3',
      status: 'outdated'
    });
  });

  it('does not mark a package outdated when npm lists it but the versions match', () => {
    // npm's `outdated` reporting is weirdly inclusive; this is the defensive path.
    const [p] = mergeNpmGlobals(
      { dependencies: { eslint: { version: '9.39.1' } } },
      { eslint: { current: '9.39.1', wanted: '9.39.1', latest: '9.39.1' } }
    );
    expect(p.status).toBe('current');
  });

  it('handles no global packages at all', () => {
    expect(mergeNpmGlobals({}, {})).toEqual([]);
    expect(mergeNpmGlobals({ dependencies: {} }, {})).toEqual([]);
  });

  it('sorts by package name', () => {
    const names = mergeNpmGlobals(
      {
        dependencies: {
          typescript: { version: '5.9.3' },
          '@anthropic-ai/claude-code': { version: '2.1.0' },
          npm: { version: '12.0.2' }
        }
      },
      {}
    ).map((p) => p.name);
    expect(names).toEqual(['@anthropic-ai/claude-code', 'npm', 'typescript']);
  });
});
