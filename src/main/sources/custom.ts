import type { CustomSource, CustomSourceTest, Package } from '../../shared/types';
import { childEnv } from '../childEnv';
import { execToolAllowExit } from '../exec';
import { resolveCommand } from '../tools';
import { parseCustomOutput } from './customParse';
import type { Source } from './source';

/** A misconfigured command shouldn't hang a refresh forever. */
const TIMEOUT_MS = 60_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/** Lines of raw stdout returned to the Settings preview. */
const SAMPLE_LINES = 20;
const PREVIEW_ITEMS = 50;

async function runCustom(config: CustomSource): Promise<{ resolved: string; stdout: string }> {
  const resolved = await resolveCommand(config.command);
  if (!resolved) {
    throw new Error(`Command not found: ${config.command}`);
  }

  // execFile with an args array and no shell: the command and its arguments are
  // never re-parsed, so a value containing spaces or `;` stays one argument.
  const stdout = await execToolAllowExit(
    resolved,
    config.args,
    { env: childEnv({ NO_COLOR: '1' }), maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS },
    config.allowExitCodes ?? []
  );

  return { resolved, stdout };
}

export function makeCustomSource(config: CustomSource): Source {
  return {
    id: config.id,
    label: config.label,
    itemNoun: config.itemNoun || 'items',
    description: [config.command, ...config.args].join(' '),
    isCustom: true,
    hint: 'Check the command in Settings → Custom sources',

    detect: async () => {
      const resolved = await resolveCommand(config.command);
      return { detected: resolved !== null, toolPath: resolved ?? undefined };
    },

    fetch: async (ctx) => {
      ctx.note(config.command);
      const { stdout } = await runCustom(config);
      return parseCustomOutput(stdout, config.mode, config.pattern, config.id, {
        listsOnlyUpdates: config.listsOnlyUpdates
      });
    },

    upgradeCommand: config.upgradeCommand
      ? (outdated: Package[]): string => (outdated.length ? config.upgradeCommand! : '')
      : undefined
  };
}

/** Runs a candidate config once and reports both raw output and parsed rows. */
export async function testCustomSource(config: CustomSource): Promise<CustomSourceTest> {
  let resolved: string;
  let stdout: string;

  try {
    ({ resolved, stdout } = await runCustom(config));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const rawSample = stdout.split('\n').slice(0, SAMPLE_LINES).join('\n');

  try {
    const items = parseCustomOutput(stdout, config.mode, config.pattern, config.id, {
      listsOnlyUpdates: config.listsOnlyUpdates
    });
    return {
      ok: true,
      resolvedCommand: resolved,
      rawSample,
      items: items.slice(0, PREVIEW_ITEMS),
      totalItems: items.length
    };
  } catch (err) {
    // The command ran but parsing failed — show the raw output anyway, since
    // that's exactly what the user needs in order to fix the pattern.
    return {
      ok: false,
      resolvedCommand: resolved,
      rawSample,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
