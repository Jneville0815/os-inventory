import { describe, it, expect } from 'vitest';
import { escapeModulePath, parseVersionOutput } from './goInstall';

describe('parseVersionOutput', () => {
  it('reads path and mod from a real `go version -m` block', () => {
    const out = [
      '/Users/me/go/bin/staticcheck: go1.24.0',
      '\tpath\thonnef.co/go/tools/cmd/staticcheck',
      '\tmod\thonnef.co/go/tools\tv0.6.1\th1:1rjCNs0EbdcvoyUPttcv/pq2HklS+bDFtq1RRasA5ro=',
      '\tdep\tgithub.com/BurntSushi/toml\tv1.4.1\th1:GaI7EiDXDRfa8VshkTj7Fym7ha+y8/XxIgD2okUIjLw=',
      '\tbuild\t-buildmode=exe'
    ].join('\n');

    expect(parseVersionOutput(out)).toEqual([
      {
        binary: 'staticcheck',
        installPath: 'honnef.co/go/tools/cmd/staticcheck',
        module: 'honnef.co/go/tools',
        version: 'v0.6.1'
      }
    ]);
  });

  it('parses several binaries from one invocation', () => {
    const out = [
      '/Users/me/go/bin/gopls: go1.24.0',
      '\tpath\tgolang.org/x/tools/gopls',
      '\tmod\tgolang.org/x/tools/gopls\tv0.17.1\th1:aaa=',
      '',
      '/Users/me/go/bin/dlv: go1.24.0',
      '\tpath\tgithub.com/go-delve/delve/cmd/dlv',
      '\tmod\tgithub.com/go-delve/delve\tv1.24.0\th1:bbb='
    ].join('\n');

    expect(parseVersionOutput(out).map((b) => b.binary)).toEqual(['gopls', 'dlv']);
  });

  it('skips non-Go files, which report an error and have no mod line', () => {
    const out = [
      '/Users/me/go/bin/README: could not read Go build info from /Users/me/go/bin/README: unrecognized file format',
      '/Users/me/go/bin/gopls: go1.24.0',
      '\tpath\tgolang.org/x/tools/gopls',
      '\tmod\tgolang.org/x/tools/gopls\tv0.17.1\th1:aaa='
    ].join('\n');

    expect(parseVersionOutput(out).map((b) => b.binary)).toEqual(['gopls']);
  });

  it('drops an entry with a path but no mod line (built from a local checkout)', () => {
    const out = ['/Users/me/go/bin/scratch: go1.24.0', '\tpath\tcommand-line-arguments'].join('\n');
    expect(parseVersionOutput(out)).toEqual([]);
  });

  it('returns nothing for empty output', () => {
    expect(parseVersionOutput('')).toEqual([]);
  });
});

describe('escapeModulePath', () => {
  it('leaves all-lowercase module paths alone', () => {
    expect(escapeModulePath('golang.org/x/tools/gopls')).toBe('golang.org/x/tools/gopls');
  });

  it('escapes uppercase as !lower, per the module proxy protocol', () => {
    expect(escapeModulePath('github.com/BurntSushi/toml')).toBe('github.com/!burnt!sushi/toml');
    expect(escapeModulePath('github.com/Masterminds/semver')).toBe('github.com/!masterminds/semver');
  });
});
