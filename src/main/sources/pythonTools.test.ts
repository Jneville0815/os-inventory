import { describe, it, expect } from 'vitest';
import { parseUvToolList } from './uvTools';
import { parsePipxList } from './pipx';

// Verbatim from `uv tool list` (uv 0.7.19). Binary lines start with "- ",
// they are NOT indented — the parser has to key off that.
const UV_REAL = `cowsay v5.0
- cowsay
pipx v1.16.6
- pipx
ruff v0.5.0
- ruff`;

describe('parseUvToolList', () => {
  it('reads name and version from the header lines', () => {
    expect(parseUvToolList(UV_REAL)).toEqual([
      { name: 'cowsay', version: '5.0' },
      { name: 'pipx', version: '1.16.6' },
      { name: 'ruff', version: '0.5.0' }
    ]);
  });

  it('ignores the "- binary" lines rather than treating them as tools', () => {
    expect(parseUvToolList(UV_REAL).map((t) => t.name)).not.toContain('-');
    expect(parseUvToolList(UV_REAL)).toHaveLength(3);
  });

  it('handles a tool exposing several binaries', () => {
    const out = 'httpie v3.2.2\n- http\n- https\n- httpie';
    expect(parseUvToolList(out)).toEqual([{ name: 'httpie', version: '3.2.2' }]);
  });

  it('returns nothing when no tools are installed', () => {
    // uv prints "No tools installed" — no header line, so nothing matches.
    expect(parseUvToolList('No tools installed')).toEqual([]);
    expect(parseUvToolList('')).toEqual([]);
  });
});

// Verbatim structure from `pipx list --json` (pipx 1.16.6).
const PIPX_REAL = {
  pipx_spec_version: '0.1',
  venvs: {
    cowsay: { metadata: { main_package: { package: 'cowsay', package_version: '5.0' } } },
    ruff: { metadata: { main_package: { package: 'ruff', package_version: '0.5.0' } } }
  }
};

describe('parsePipxList', () => {
  it('reads the package name and version out of each venv', () => {
    expect(parsePipxList(PIPX_REAL)).toEqual([
      { name: 'cowsay', version: '5.0' },
      { name: 'ruff', version: '0.5.0' }
    ]);
  });

  it('prefers the metadata package name over the venv key', () => {
    // The two usually match, but the venv key isn't authoritative.
    const json = {
      venvs: { 'some-venv': { metadata: { main_package: { package: 'real-name', package_version: '1.0' } } } }
    };
    expect(parsePipxList(json)[0].name).toBe('real-name');
  });

  it('handles the empty case pipx reports when nothing is installed', () => {
    expect(parsePipxList({ pipx_spec_version: '0.1', venvs: {} })).toEqual([]);
    expect(parsePipxList({})).toEqual([]);
  });

  it('skips venvs with no usable package name', () => {
    expect(parsePipxList({ venvs: { broken: { metadata: {} } } })).toEqual([]);
  });
});
