import { describe, it, expect } from 'vitest';
import { latestStableVersion, satisfiesEngine } from './vscodeExtensions';

const PRERELEASE = 'Microsoft.VisualStudio.Code.PreRelease';
const ENGINE = 'Microsoft.VisualStudio.Code.Engine';

const version = (
  v: string,
  opts: { prerelease?: boolean; engine?: string } = {}
): { version: string; properties: Array<{ key: string; value: string }> } => {
  const properties: Array<{ key: string; value: string }> = [];
  if (opts.prerelease) properties.push({ key: PRERELEASE, value: 'true' });
  if (opts.engine) properties.push({ key: ENGINE, value: opts.engine });
  return { version: v, properties };
};

describe('satisfiesEngine', () => {
  const installed = [1, 117, 2]; // VS Code 1.117.2

  it('accepts a requirement below the installed version', () => {
    expect(satisfiesEngine('^1.100.0', installed)).toBe(true);
  });

  it('accepts an exactly-matching requirement', () => {
    expect(satisfiesEngine('^1.117.2', installed)).toBe(true);
  });

  it('accepts a lower patch on the same minor', () => {
    expect(satisfiesEngine('^1.117.0', installed)).toBe(true);
  });

  it('rejects a higher patch on the same minor', () => {
    expect(satisfiesEngine('^1.117.5', installed)).toBe(false);
  });

  it('rejects a higher minor', () => {
    expect(satisfiesEngine('^1.118.0', installed)).toBe(false);
  });

  it('rejects a different major — caret does not cross majors', () => {
    expect(satisfiesEngine('^2.0.0', installed)).toBe(false);
  });

  it('treats an unparseable range as compatible rather than hiding an update', () => {
    expect(satisfiesEngine('>=1.90.0', installed)).toBe(true);
    expect(satisfiesEngine('*', installed)).toBe(true);
  });
});

describe('latestStableVersion', () => {
  const installed = [1, 117, 2];

  it('returns the newest version when nothing is filtered out', () => {
    expect(latestStableVersion([version('2.1.0'), version('2.0.0')], installed)).toBe('2.1.0');
  });

  it('skips pre-releases — the reason stable-track users saw spurious updates', () => {
    const versions = [
      version('2025.9.100', { prerelease: true }),
      version('2025.8.0'),
      version('2025.7.0')
    ];
    expect(latestStableVersion(versions, installed)).toBe('2025.8.0');
  });

  it('skips versions requiring a newer editor than the one installed', () => {
    const versions = [
      version('3.0.0', { engine: '^1.120.0' }),
      version('2.9.0', { engine: '^1.117.0' })
    ];
    expect(latestStableVersion(versions, installed)).toBe('2.9.0');
  });

  it('applies both filters together', () => {
    const versions = [
      version('4.0.0', { prerelease: true, engine: '^1.117.0' }),
      version('3.5.0', { engine: '^1.200.0' }),
      version('3.0.0', { engine: '^1.110.0' })
    ];
    expect(latestStableVersion(versions, installed)).toBe('3.0.0');
  });

  it('returns undefined when every version is filtered out', () => {
    const versions = [version('9.9.9', { engine: '^1.999.0' }), version('9.9.8', { prerelease: true })];
    expect(latestStableVersion(versions, installed)).toBeUndefined();
  });

  it('returns undefined for an empty version list', () => {
    expect(latestStableVersion([], installed)).toBeUndefined();
  });
});
