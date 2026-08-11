import { describe, it, expect } from 'vitest';
import { parseJsonOutput, parseRegexOutput, parseTsvOutput } from './customParse';

const ID = 'custom:test' as const;

describe('parseRegexOutput', () => {
  // Real `mas outdated` output.
  const MAS = `497799835 Xcode (14.2 -> 15.0)
1295203466 Microsoft Remote Desktop (10.7.8 -> 10.9.1)`;
  const MAS_PATTERN =
    '^\\s*\\d+\\s+(?<name>.+?)\\s+\\((?<installed>[^\\s)]+)\\s*->\\s*(?<latest>[^)]+)\\)';

  it('extracts named groups from each line', () => {
    expect(parseRegexOutput(MAS, MAS_PATTERN, ID)).toEqual([
      {
        sourceId: ID,
        name: 'Microsoft Remote Desktop',
        installedVersion: '10.7.8',
        latestVersion: '10.9.1',
        status: 'outdated'
      },
      {
        sourceId: ID,
        name: 'Xcode',
        installedVersion: '14.2',
        latestVersion: '15.0',
        status: 'outdated'
      }
    ]);
  });

  it('ignores lines that do not match — headers, banners, blank lines', () => {
    const noisy = `Checking for updates...\n\n${MAS}\n\nDone.`;
    expect(parseRegexOutput(noisy, MAS_PATTERN, ID)).toHaveLength(2);
  });

  it('reads `unknown` when the pattern captures no latest version', () => {
    const out = 'ripgrep 14.1.1';
    const [p] = parseRegexOutput(out, '^(?<name>\\S+)\\s+(?<installed>\\S+)', ID);
    expect(p).toMatchObject({ installedVersion: '14.1.1', latestVersion: '', status: 'unknown' });
  });

  it('reads `current` when installed and latest are equal', () => {
    const [p] = parseRegexOutput(
      'ripgrep 14.1.1 14.1.1',
      '^(?<name>\\S+)\\s+(?<installed>\\S+)\\s+(?<latest>\\S+)',
      ID
    );
    expect(p.status).toBe('current');
  });

  it('skips a match whose name group captured nothing', () => {
    // `name` is optional here and matches empty at position 0.
    expect(parseRegexOutput('1.0.0', '^(?<name>[a-z]*)(?<installed>[\\d.]+)$', ID)).toEqual([]);
  });

  it('does not let a global pattern lose matches to a stale lastIndex', () => {
    const out = 'a 1.0\nb 2.0\nc 3.0';
    const rows = parseRegexOutput(out, '(?<name>\\w+) (?<installed>\\S+)', ID);
    expect(rows.map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing when the pattern matches nothing', () => {
    expect(parseRegexOutput(MAS, '^(?<name>zzz)$', ID)).toEqual([]);
  });
});

describe('parseTsvOutput', () => {
  it('reads name, installed and latest', () => {
    const out = 'ripgrep\t14.1.1\t14.1.2\nfd\t10.2.0\t10.2.0';
    expect(parseTsvOutput(out, ID)).toEqual([
      {
        sourceId: ID,
        name: 'fd',
        installedVersion: '10.2.0',
        latestVersion: '10.2.0',
        status: 'current'
      },
      {
        sourceId: ID,
        name: 'ripgrep',
        installedVersion: '14.1.1',
        latestVersion: '14.1.2',
        status: 'outdated'
      }
    ]);
  });

  it('treats a missing third column as an unknown latest version', () => {
    const [p] = parseTsvOutput('ripgrep\t14.1.1', ID);
    expect(p).toMatchObject({ latestVersion: '', status: 'unknown' });
  });

  it('skips blank lines and # comments', () => {
    expect(parseTsvOutput('# header\n\nfd\t1.0\t1.0\n', ID)).toHaveLength(1);
  });

  it('handles empty output', () => {
    expect(parseTsvOutput('', ID)).toEqual([]);
  });
});

describe('parseJsonOutput', () => {
  it('reads an array of objects', () => {
    const out = JSON.stringify([
      { name: 'ripgrep', installed: '14.1.1', latest: '14.1.2' },
      { name: 'fd', installed: '10.2.0', latest: '10.2.0' }
    ]);
    expect(parseJsonOutput(out, ID).map((p) => [p.name, p.status])).toEqual([
      ['fd', 'current'],
      ['ripgrep', 'outdated']
    ]);
  });

  it('accepts `version` as an alias for `installed`', () => {
    const [p] = parseJsonOutput('[{"name":"fd","version":"10.2.0"}]', ID);
    expect(p.installedVersion).toBe('10.2.0');
  });

  it('skips entries with no name and ignores non-string fields', () => {
    const out = '[{"installed":"1.0"},{"name":"ok","installed":5}]';
    const rows = parseJsonOutput(out, ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'ok', installedVersion: '' });
  });

  it('explains itself when stdout is not JSON', () => {
    expect(() => parseJsonOutput('not json at all', ID)).toThrow(/valid JSON/);
  });

  it('explains itself when the JSON is not an array', () => {
    expect(() => parseJsonOutput('{"name":"fd"}', ID)).toThrow(/JSON array/);
  });

  it('handles empty output', () => {
    expect(parseJsonOutput('   ', ID)).toEqual([]);
  });
});

describe('shared row handling', () => {
  it('de-duplicates by name — PackageTable keys on it', () => {
    const rows = parseTsvOutput('fd\t1.0\t1.0\nfd\t2.0\t2.0', ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].installedVersion).toBe('1.0');
  });

  it('sorts by name', () => {
    const rows = parseTsvOutput('zsh\t1\t1\nabc\t1\t1\nmid\t1\t1', ID);
    expect(rows.map((r) => r.name)).toEqual(['abc', 'mid', 'zsh']);
  });

  it('trims whitespace out of captured values', () => {
    const [p] = parseRegexOutput('  fd   1.0.0  ', '(?<name>fd)\\s+(?<installed>[\\d.]+)', ID);
    expect(p).toMatchObject({ name: 'fd', installedVersion: '1.0.0' });
  });
});
