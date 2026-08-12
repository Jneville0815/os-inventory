import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ExecFileOptions } from 'node:child_process';

const execFileAsync = promisify(execFile);

/**
 * Runs a resolved tool and returns its stdout.
 *
 * Always `execFile` with an args array and no shell, so an argument containing
 * spaces, `;` or a glob stays one literal argument. Custom sources rely on this
 * — see the security note in CLAUDE.md.
 */
export async function execTool(
  toolPath: string,
  args: string[],
  options: ExecFileOptions
): Promise<string> {
  const { stdout } = await execFileAsync(toolPath, args, options);
  return stdout.toString();
}

/**
 * Same, but resolves with stdout for the given non-zero exit codes instead of
 * throwing. Several tools exit non-zero by design: `npm outdated` and
 * `pnpm outdated` whenever anything is stale, `composer global outdated` when
 * there's no global manifest at all.
 */
export function execToolAllowExit(
  toolPath: string,
  args: string[],
  options: ExecFileOptions,
  allowedCodes: number[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(toolPath, args, options, (err, stdout, stderr) => {
      if (err && !allowedCodes.includes(Number(err.code))) {
        reject(new Error(String(stderr) || err.message));
        return;
      }
      resolve(stdout.toString());
    });
  });
}
