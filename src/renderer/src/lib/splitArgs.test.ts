import { describe, it, expect } from 'vitest';
import { splitArgs } from './splitArgs';

describe('splitArgs', () => {
  it('splits on whitespace', () => {
    expect(splitArgs('list --json --depth=0')).toEqual(['list', '--json', '--depth=0']);
  });

  it('keeps a double-quoted segment as one argument', () => {
    expect(splitArgs('-c "echo hello world"')).toEqual(['-c', 'echo hello world']);
  });

  it('keeps a single-quoted segment as one argument', () => {
    expect(splitArgs("-c 'echo hi'")).toEqual(['-c', 'echo hi']);
  });

  it('collapses runs of whitespace', () => {
    expect(splitArgs('  outdated   --all  ')).toEqual(['outdated', '--all']);
  });

  it('returns nothing for an empty field', () => {
    expect(splitArgs('')).toEqual([]);
    expect(splitArgs('   ')).toEqual([]);
  });

  it('passes shell metacharacters through as literal text — there is no shell', () => {
    // These reach execFile as ordinary argument strings, not operators.
    expect(splitArgs('a; rm -rf /')).toEqual(['a;', 'rm', '-rf', '/']);
    expect(splitArgs('foo | bar')).toEqual(['foo', '|', 'bar']);
    expect(splitArgs('*.txt')).toEqual(['*.txt']);
  });
});
