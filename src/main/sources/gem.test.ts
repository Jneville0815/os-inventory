import { describe, it, expect } from 'vitest';
import { parseGemOutdated } from './gem';

// Verbatim stdout from `gem outdated` on a real machine.
const REAL = `CFPropertyList (2.3.6 < 4.0.0)
activesupport (6.0.4 < 8.1.3.1)
addressable (2.8.0 < 2.9.0)
bigdecimal (1.4.1 < 4.1.2)
bundler (2.3.7 < 4.0.18)`;

describe('parseGemOutdated', () => {
  it('reads name, installed and latest from real output', () => {
    const rows = parseGemOutdated(REAL);
    expect(rows).toHaveLength(5);
    expect(rows.find((r) => r.name === 'CFPropertyList')).toEqual({
      sourceId: 'gem',
      name: 'CFPropertyList',
      installedVersion: '2.3.6',
      latestVersion: '4.0.0',
      status: 'outdated'
    });
  });

  it('marks everything outdated — `gem outdated` lists nothing else', () => {
    expect(parseGemOutdated(REAL).every((r) => r.status === 'outdated')).toBe(true);
  });

  it('handles versions with more than three segments', () => {
    const [p] = parseGemOutdated('activesupport (6.0.4 < 8.1.3.1)');
    expect(p).toMatchObject({ installedVersion: '6.0.4', latestVersion: '8.1.3.1' });
  });

  it('sorts by gem name', () => {
    expect(parseGemOutdated(REAL).map((r) => r.name)).toEqual([
      'activesupport',
      'addressable',
      'bigdecimal',
      'bundler',
      'CFPropertyList'
    ]);
  });

  it('ignores lines that are not gem entries', () => {
    // Extension warnings normally go to stderr, but be robust if they don't.
    const noisy = `Ignoring ffi-1.15.5 because its extensions are not built.\n${REAL}`;
    expect(parseGemOutdated(noisy)).toHaveLength(5);
  });

  it('returns nothing when everything is current', () => {
    expect(parseGemOutdated('')).toEqual([]);
    expect(parseGemOutdated('\n\n')).toEqual([]);
  });

  it('de-duplicates repeated gem names', () => {
    expect(parseGemOutdated('rake (1.0 < 2.0)\nrake (1.0 < 2.0)')).toHaveLength(1);
  });
});
