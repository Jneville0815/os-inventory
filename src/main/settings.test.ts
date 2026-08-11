import { describe, it, expect, vi } from 'vitest';

// settings.ts pulls app.getPath('userData') for the file location; the
// normalization logic under test doesn't touch the filesystem.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/os-inventory-test' } }));

const { normalizeSettings, normalizeCustomSource, DEFAULT_SETTINGS } = await import('./settings');

const validCustom = {
  id: 'custom:mas',
  label: 'Mac App Store',
  itemNoun: 'apps',
  command: 'mas',
  args: ['outdated'],
  mode: 'tsv'
};

describe('normalizeSettings', () => {
  it('tracks nothing by default', () => {
    expect(DEFAULT_SETTINGS.sources).toEqual([]);
    expect(normalizeSettings(undefined).sources).toEqual([]);
    expect(normalizeSettings(null).sources).toEqual([]);
    expect(normalizeSettings({}).sources).toEqual([]);
  });

  it('keeps known sources in the order given — order is tab order', () => {
    const s = normalizeSettings({ sources: ['go-install', 'homebrew-formula', 'npm-global'] });
    expect(s.sources).toEqual(['go-install', 'homebrew-formula', 'npm-global']);
  });

  it('drops source ids it does not recognise', () => {
    const s = normalizeSettings({ sources: ['npm-global', 'winget', 'apt'] });
    expect(s.sources).toEqual(['npm-global']);
  });

  it('de-duplicates, keeping first position', () => {
    const s = normalizeSettings({ sources: ['go-install', 'npm-global', 'go-install'] });
    expect(s.sources).toEqual(['go-install', 'npm-global']);
  });

  it('survives a sources field of the wrong type', () => {
    expect(normalizeSettings({ sources: 'npm-global' }).sources).toEqual([]);
    expect(normalizeSettings({ sources: 42 }).sources).toEqual([]);
  });

  it('keeps tool path overrides for known tools, trimmed', () => {
    const s = normalizeSettings({ toolPaths: { go: '  /opt/custom/go  ', brew: '/usr/local/bin/brew' } });
    expect(s.toolPaths).toEqual({ brew: '/usr/local/bin/brew', go: '/opt/custom/go' });
  });

  it('drops unknown tools, blank strings and non-strings', () => {
    const s = normalizeSettings({
      toolPaths: { cargo: '/usr/bin/cargo', go: '   ', npm: 123, code: '/usr/local/bin/code' }
    });
    expect(s.toolPaths).toEqual({ code: '/usr/local/bin/code' });
  });

  it('clamps the refresh interval into range', () => {
    expect(normalizeSettings({ autoRefreshMinutes: -5 }).autoRefreshMinutes).toBe(0);
    expect(normalizeSettings({ autoRefreshMinutes: 99999 }).autoRefreshMinutes).toBe(1440);
    expect(normalizeSettings({ autoRefreshMinutes: 30.7 }).autoRefreshMinutes).toBe(31);
  });

  it('falls back to the default interval for a nonsense value', () => {
    expect(normalizeSettings({ autoRefreshMinutes: 'hourly' }).autoRefreshMinutes).toBe(60);
    expect(normalizeSettings({}).autoRefreshMinutes).toBe(60);
  });

  it('always stamps the current schema', () => {
    expect(normalizeSettings({ schema: 99 }).schema).toBe(1);
  });

  it('keeps a tracked custom source once it is defined', () => {
    const s = normalizeSettings({ sources: ['custom:mas'], customSources: [validCustom] });
    expect(s.sources).toEqual(['custom:mas']);
    expect(s.customSources).toHaveLength(1);
  });

  it('drops a tracked custom id with no surviving definition — that would be an empty tab', () => {
    expect(normalizeSettings({ sources: ['custom:ghost'], customSources: [] }).sources).toEqual([]);
    // Also when the definition itself fails validation.
    const s = normalizeSettings({
      sources: ['custom:mas'],
      customSources: [{ ...validCustom, command: '' }]
    });
    expect(s.sources).toEqual([]);
    expect(s.customSources).toEqual([]);
  });

  it('de-duplicates custom sources by id', () => {
    const s = normalizeSettings({
      customSources: [validCustom, { ...validCustom, label: 'Duplicate' }]
    });
    expect(s.customSources).toHaveLength(1);
    expect(s.customSources[0].label).toBe('Mac App Store');
  });

  it('defaults customSources to empty', () => {
    expect(normalizeSettings({}).customSources).toEqual([]);
    expect(DEFAULT_SETTINGS.customSources).toEqual([]);
  });
});

describe('normalizeCustomSource', () => {
  it('accepts a well-formed source', () => {
    expect(normalizeCustomSource(validCustom)).toMatchObject({
      id: 'custom:mas',
      label: 'Mac App Store',
      command: 'mas',
      args: ['outdated'],
      mode: 'tsv'
    });
  });

  it('rejects ids not in the custom: namespace', () => {
    expect(normalizeCustomSource({ ...validCustom, id: 'mas' })).toBeNull();
    expect(normalizeCustomSource({ ...validCustom, id: 'homebrew-formula' })).toBeNull();
    expect(normalizeCustomSource({ ...validCustom, id: 'custom:Bad Slug' })).toBeNull();
    expect(normalizeCustomSource({ ...validCustom, id: 'custom:' })).toBeNull();
  });

  it('requires a label and a command', () => {
    expect(normalizeCustomSource({ ...validCustom, label: '  ' })).toBeNull();
    expect(normalizeCustomSource({ ...validCustom, command: '' })).toBeNull();
  });

  it('requires a pattern in regex mode', () => {
    expect(normalizeCustomSource({ ...validCustom, mode: 'regex' })).toBeNull();
    expect(
      normalizeCustomSource({ ...validCustom, mode: 'regex', pattern: '(?<name>\\S+)' })
    ).toMatchObject({ mode: 'regex' });
  });

  it('rejects a pattern that will not compile, which would throw on every refresh', () => {
    expect(normalizeCustomSource({ ...validCustom, mode: 'regex', pattern: '(?<name>' })).toBeNull();
    expect(normalizeCustomSource({ ...validCustom, mode: 'regex', pattern: '[z-a]' })).toBeNull();
  });

  it('falls back to tsv for an unrecognised mode', () => {
    expect(normalizeCustomSource({ ...validCustom, mode: 'yaml' })?.mode).toBe('tsv');
  });

  it('keeps args as an array of strings and drops anything else', () => {
    expect(normalizeCustomSource({ ...validCustom, args: ['a', 3, null, 'b'] })?.args).toEqual([
      'a',
      'b'
    ]);
    expect(normalizeCustomSource({ ...validCustom, args: 'outdated' })?.args).toEqual([]);
  });

  it('keeps only integer exit codes, and omits the field when empty', () => {
    expect(normalizeCustomSource({ ...validCustom, allowExitCodes: [1, 'x', 2.5, 2] })
      ?.allowExitCodes).toEqual([1, 2]);
    expect(normalizeCustomSource(validCustom)?.allowExitCodes).toBeUndefined();
  });

  it('defaults itemNoun rather than leaving it blank', () => {
    expect(normalizeCustomSource({ ...validCustom, itemNoun: '' })?.itemNoun).toBe('items');
  });
});
