import { homedir } from 'node:os';
import { join } from 'node:path';

// GUI apps launched from Finder/Dock/Launchpad don't inherit the shell's PATH
// (macOS launchd starts them with a bare minimum, ~ "/usr/bin:/bin:/usr/sbin:/sbin").
// We resolve absolute paths to the CLIs we spawn directly (see tools.ts), but
// some of those CLIs re-exec themselves via an `#!/usr/bin/env <interpreter>`
// shebang (e.g. npm's global CLI needs `node`) — `env` resolves that interpreter
// through the *child's* PATH, so it still fails unless we widen it here too.
const EXTRA_PATH_DIRS = [
  // Apple Silicon and Intel Homebrew respectively.
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  // Where uv and pipx install.
  join(homedir(), '.local', 'bin')
];

export function childEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const existing = process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin';
  const current = existing.split(':');
  const dirs = EXTRA_PATH_DIRS.filter((dir) => !current.includes(dir));
  return { ...process.env, ...extra, PATH: [...dirs, existing].join(':') };
}
