import { describe, it, expect } from 'vitest';
import { RECIPES, findRecipe, recipeToCustomSource } from './recipes';
import { parseCustomOutput } from '../main/sources/customParse';
import type { Package } from './types';

/**
 * Fixtures below are verbatim stdout captured from these tools on a real
 * machine. If a recipe is added without a fixture here, it isn't verified —
 * and an unverified recipe is worse than none, because the user can't tell a
 * broken pattern from a clean machine.
 */
const FIXTURES: Record<string, string> = {
  mas: `497799835 Xcode (26.4 -> 26.6)
1295203466 Microsoft Remote Desktop (10.7.8 -> 11.3.8)
462054704 Microsoft Word (16.61 -> 16.111.3)`,

  'macos-updates': `Software Update Tool

Finding available software
Software Update found the following new or updated software:
* Label: macOS Tahoe 26.6.1-25G76
\tTitle: macOS Tahoe 26.6.1, Version: 26.6.1, Size: 3827320KiB, Recommended: YES, Action: restart, `,

  gem: `CFPropertyList (2.3.6 < 4.0.0)
activesupport (6.0.4 < 8.1.3.1)
addressable (2.8.0 < 2.9.0)
bigdecimal (1.4.1 < 4.1.2)`,

  pip: `[{"name": "packaging", "version": "26.1", "latest_version": "26.3", "latest_filetype": "wheel"}, {"name": "pip", "version": "26.1.2", "latest_version": "26.2.1", "latest_filetype": "wheel"}]`
};

const parse = (slug: string, stdout: string): Package[] => {
  const recipe = findRecipe(slug)!;
  return parseCustomOutput(stdout, recipe.mode, recipe.pattern, `custom:${slug}`, {
    listsOnlyUpdates: recipe.listsOnlyUpdates
  });
};

describe('recipe library', () => {
  it('has a captured fixture for every recipe', () => {
    expect(RECIPES.map((r) => r.slug).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it('gives every recipe a unique slug', () => {
    const slugs = RECIPES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('only ships recipes whose command can report a latest version', () => {
    // A recipe that can't tell you what's latest produces a tab of "unknown".
    for (const recipe of RECIPES) {
      const reportsLatest = recipe.mode !== 'regex' || recipe.pattern!.includes('(?<latest>');
      expect(recipe.listsOnlyUpdates === true || reportsLatest).toBe(true);
    }
  });

  it('converts to a custom source with a namespaced id', () => {
    const source = recipeToCustomSource(findRecipe('mas')!);
    expect(source.id).toBe('custom:mas');
    expect(source).toMatchObject({ command: 'mas', args: ['outdated'], mode: 'regex' });
    // Picker-only metadata shouldn't leak into the stored config.
    expect(source).not.toHaveProperty('slug');
    expect(source).not.toHaveProperty('category');
    expect(source).not.toHaveProperty('platforms');
  });
});

describe('recipes against real captured output', () => {
  it('mas outdated', () => {
    expect(parse('mas', FIXTURES.mas)).toEqual([
      {
        sourceId: 'custom:mas',
        name: 'Microsoft Remote Desktop',
        installedVersion: '10.7.8',
        latestVersion: '11.3.8',
        status: 'outdated'
      },
      {
        sourceId: 'custom:mas',
        name: 'Microsoft Word',
        installedVersion: '16.61',
        latestVersion: '16.111.3',
        status: 'outdated'
      },
      {
        sourceId: 'custom:mas',
        name: 'Xcode',
        installedVersion: '26.4',
        latestVersion: '26.6',
        status: 'outdated'
      }
    ]);
  });

  it('gem outdated', () => {
    const rows = parse('gem', FIXTURES.gem);
    expect(rows).toHaveLength(4);
    // Rows come back sorted by name, so look them up rather than index.
    expect(rows.find((r) => r.name === 'CFPropertyList')).toMatchObject({
      installedVersion: '2.3.6',
      latestVersion: '4.0.0',
      status: 'outdated'
    });
    expect(rows.find((r) => r.name === 'bigdecimal')).toMatchObject({
      installedVersion: '1.4.1',
      latestVersion: '4.1.2'
    });
    expect(rows.every((r) => r.status === 'outdated')).toBe(true);
  });

  it('pip list --outdated --format=json, via the version/latest_version aliases', () => {
    expect(parse('pip', FIXTURES.pip)).toEqual([
      {
        sourceId: 'custom:pip',
        name: 'packaging',
        installedVersion: '26.1',
        latestVersion: '26.3',
        status: 'outdated'
      },
      {
        sourceId: 'custom:pip',
        name: 'pip',
        installedVersion: '26.1.2',
        latestVersion: '26.2.1',
        status: 'outdated'
      }
    ]);
  });

  it('softwareupdate -l, ignoring its banner lines', () => {
    const rows = parse('macos-updates', FIXTURES['macos-updates']);
    expect(rows).toEqual([
      {
        sourceId: 'custom:macos-updates',
        name: 'macOS Tahoe 26.6.1',
        installedVersion: '',
        latestVersion: '26.6.1',
        // listsOnlyUpdates: appearing in this output *is* the signal, even
        // though the tool never says what version you're currently on.
        status: 'outdated'
      }
    ]);
  });

  it('reports nothing when softwareupdate finds nothing', () => {
    const clean = 'Software Update Tool\n\nFinding available software\nNo new software available.\n';
    expect(parse('macos-updates', clean)).toEqual([]);
  });

  it('reports nothing when a manager has no outdated packages', () => {
    expect(parse('mas', '')).toEqual([]);
    expect(parse('gem', '')).toEqual([]);
    expect(parse('pip', '[]')).toEqual([]);
  });
});
