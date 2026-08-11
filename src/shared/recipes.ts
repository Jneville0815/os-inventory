import type { CustomSource, CustomSourceId, Recipe } from './types';

/**
 * Ready-made sources the user can add in one click.
 *
 * Scope rule: developer dependencies and OS-level software that can go out of
 * date. Not editor plugins beyond VS Code, not container images — "latest
 * version" stops being well defined out there.
 *
 * **Every recipe here was verified against that tool's real output.** A recipe
 * that half-works is worse than no recipe: the user can't tell whether the
 * pattern is wrong or their machine is clean. If you can't run the tool, don't
 * add it — leave it to the freeform custom source.
 *
 * A recipe must come from a command that reports the *latest* version (or that
 * lists only updates). A command that reports installed versions alone produces
 * a tab of "unknown" rows, which is noise.
 */
export const RECIPES: Recipe[] = [
  {
    slug: 'mas',
    label: 'Mac App Store',
    itemNoun: 'apps',
    description: 'Apps installed from the Mac App Store, via the `mas` CLI.',
    category: 'os',
    platforms: ['darwin'],
    command: 'mas',
    args: ['outdated'],
    mode: 'regex',
    // 497799835 Xcode (14.2 -> 15.0)
    pattern: '^\\s*\\d+\\s+(?<name>.+?)\\s+\\((?<installed>[^\\s)]+)\\s*->\\s*(?<latest>[^)]+)\\)',
    upgradeCommand: 'mas upgrade'
  },
  {
    slug: 'macos-updates',
    label: 'macOS Software Update',
    itemNoun: 'updates',
    description: 'System updates from Apple. Slow — the check contacts Apple each refresh.',
    category: 'os',
    platforms: ['darwin'],
    command: 'softwareupdate',
    args: ['-l'],
    mode: 'regex',
    // 	Title: macOS Tahoe 26.6.1, Version: 26.6.1, Size: 3827320KiB, Recommended: YES, …
    pattern: 'Title:\\s*(?<name>[^,]+),\\s*Version:\\s*(?<latest>[^,]+),',
    // softwareupdate reports what's available, never what you're on.
    listsOnlyUpdates: true,
    upgradeCommand: 'sudo softwareupdate -i -a'
  },
  {
    slug: 'gem',
    label: 'Ruby Gems',
    itemNoun: 'gems',
    description: 'Globally installed Ruby gems with a newer release available.',
    category: 'dev',
    platforms: ['darwin', 'linux', 'win32'],
    command: 'gem',
    args: ['outdated'],
    mode: 'regex',
    // CFPropertyList (2.3.6 < 4.0.0). Warnings about unbuilt extensions go to
    // stderr, which we don't read, so stdout is only these lines.
    pattern: '^(?<name>\\S+)\\s+\\((?<installed>[^\\s<]+)\\s*<\\s*(?<latest>[^)]+)\\)',
    upgradeCommand: 'gem update'
  },
  {
    slug: 'pip',
    label: 'Python Packages (pip)',
    itemNoun: 'packages',
    description: 'Installed Python packages with a newer release on PyPI.',
    category: 'dev',
    platforms: ['darwin', 'linux', 'win32'],
    command: 'pip3',
    args: ['list', '--outdated', '--format=json'],
    // [{"name": "packaging", "version": "26.1", "latest_version": "26.3", …}]
    mode: 'json'
  }
];

export function recipeToCustomSource(recipe: Recipe): CustomSource {
  const { slug, description, category, platforms, ...config } = recipe;
  void description;
  void category;
  void platforms;
  return { ...config, id: `custom:${slug}` as CustomSourceId };
}

export function findRecipe(slug: string): Recipe | undefined {
  return RECIPES.find((r) => r.slug === slug);
}
