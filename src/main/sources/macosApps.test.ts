import { describe, it, expect } from 'vitest';
import { parseAppcast } from './macosApps';

const feed = (items: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel><title>App Changelog</title>${items}</channel>
</rss>`;

describe('parseAppcast', () => {
  it('reads sparkle:shortVersionString in element form', () => {
    const xml = feed(`
      <item>
        <title>Version 2.5</title>
        <sparkle:shortVersionString>2.5</sparkle:shortVersionString>
        <sparkle:version>2500</sparkle:version>
      </item>`);
    expect(parseAppcast(xml)).toBe('2.5');
  });

  it('reads sparkle:shortVersionString in attribute form on the enclosure', () => {
    const xml = feed(`
      <item>
        <title>Version 3.1.2</title>
        <enclosure url="https://example.com/App.zip" sparkle:version="3120"
                   sparkle:shortVersionString="3.1.2" length="123" type="application/octet-stream"/>
      </item>`);
    expect(parseAppcast(xml)).toBe('3.1.2');
  });

  it('falls back to sparkle:version when there is no short version string', () => {
    const xml = feed(`<item><title>Build 481</title><sparkle:version>481</sparkle:version></item>`);
    expect(parseAppcast(xml)).toBe('481');
  });

  it('takes the first item — Sparkle feeds are newest-first', () => {
    const xml = feed(`
      <item><sparkle:shortVersionString>4.0</sparkle:shortVersionString></item>
      <item><sparkle:shortVersionString>3.9</sparkle:shortVersionString></item>`);
    expect(parseAppcast(xml)).toBe('4.0');
  });

  it('trims surrounding whitespace', () => {
    const xml = feed(`<item><sparkle:shortVersionString>
        1.4.0
      </sparkle:shortVersionString></item>`);
    expect(parseAppcast(xml)).toBe('1.4.0');
  });

  it('returns null for a feed with no items', () => {
    expect(parseAppcast(feed(''))).toBeNull();
  });

  it('returns null for an item carrying no version at all', () => {
    expect(parseAppcast(feed('<item><title>Nothing useful</title></item>'))).toBeNull();
  });

  it('returns null for a response that is not a feed', () => {
    expect(parseAppcast('<html><body>404 Not Found</body></html>')).toBeNull();
  });
});
