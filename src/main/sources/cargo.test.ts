import { describe, it, expect } from 'vitest';
import { parseCargoList } from './cargo';

// Verbatim stdout from `cargo install --list` (cargo 1.91.1).
const REAL = `cargo-edit v0.12.2:
    cargo-add
    cargo-rm
    cargo-upgrade
ripgrep v14.1.1:
    rg
tokei v12.1.2:
    tokei
`;

describe('parseCargoList', () => {
  it('reads crate name and version from the header lines', () => {
    expect(parseCargoList(REAL)).toEqual([
      { name: 'cargo-edit', version: '0.12.2' },
      { name: 'ripgrep', version: '14.1.1' },
      { name: 'tokei', version: '12.1.2' }
    ]);
  });

  it('ignores the indented binary names', () => {
    // cargo-edit ships three binaries; it must still be one crate.
    expect(parseCargoList(REAL)).toHaveLength(3);
    expect(parseCargoList(REAL).map((c) => c.name)).not.toContain('cargo-add');
  });

  it('handles a crate with a pre-release version', () => {
    expect(parseCargoList('foo v1.0.0-beta.2:\n    foo\n')).toEqual([
      { name: 'foo', version: '1.0.0-beta.2' }
    ]);
  });

  it('handles a crate whose name contains dashes and digits', () => {
    expect(parseCargoList('cargo-nextest v0.9.100:\n    cargo-nextest\n')).toEqual([
      { name: 'cargo-nextest', version: '0.9.100' }
    ]);
  });

  it('returns nothing when nothing is installed', () => {
    expect(parseCargoList('')).toEqual([]);
    expect(parseCargoList('\n\n')).toEqual([]);
  });

  it('ignores lines that are not headers', () => {
    const noisy = `Updating crates.io index\n${REAL}`;
    expect(parseCargoList(noisy).map((c) => c.name)).toEqual(['cargo-edit', 'ripgrep', 'tokei']);
  });
});
