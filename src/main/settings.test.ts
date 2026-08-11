import { describe, it, expect, vi } from 'vitest';

// settings.ts pulls app.getPath('userData') for the file location; the
// normalization logic under test doesn't touch the filesystem.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/os-inventory-test' } }));

const { normalizeSettings, DEFAULT_SETTINGS } = await import('./settings');

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
});
