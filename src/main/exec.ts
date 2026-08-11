import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecFileOptions } from 'node:child_process';

const execFileAsync = promisify(execFile);

/**
 * Windows can't spawn a .cmd/.bat directly — Node rejects it with EINVAL unless
 * `shell: true` (the CVE-2024-27980 mitigation). npm and VS Code both ship their
 * CLI as a .cmd, so without this they simply don't run there.
 *
 * Under a shell the executable is re-parsed by cmd.exe, so the path needs
 * quoting: both live under "C:\Program Files\...". Arguments are NOT quoted —
 * every arg we pass to a .cmd is a hard-coded flag in this repo, never user
 * input or a filesystem path. Keep it that way, or quote them here first.
 */
function shellFor(toolPath: string): { command: string; shell: boolean } {
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(toolPath);
  return { command: needsShell ? `"${toolPath}"` : toolPath, shell: needsShell };
}

export async function execTool(
  toolPath: string,
  args: string[],
  options: ExecFileOptions
): Promise<string> {
  const { command, shell } = shellFor(toolPath);
  const { stdout } = await execFileAsync(command, args, { ...options, shell });
  return stdout.toString();
}

/**
 * Same, but resolves with stdout for the given non-zero exit codes instead of
 * throwing — `npm outdated` exits 1 whenever anything is out of date.
 */
export function execToolAllowExit(
  toolPath: string,
  args: string[],
  options: ExecFileOptions,
  allowedCodes: number[]
): Promise<string> {
  const { command, shell } = shellFor(toolPath);
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, shell }, (err, stdout, stderr) => {
      if (err && !allowedCodes.includes(Number(err.code))) {
        reject(new Error(String(stderr) || err.message));
        return;
      }
      resolve(stdout.toString());
    });
  });
}
