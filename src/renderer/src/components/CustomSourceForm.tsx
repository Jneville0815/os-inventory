import { useState } from 'react';
import type {
  CustomSource,
  CustomSourceId,
  CustomSourceMode,
  CustomSourceTest
} from '../../../shared/types';
import { splitArgs } from '../lib/splitArgs';

type Props = {
  /** Editing an existing source, or undefined when creating one. */
  initial?: CustomSource;
  /** Ids already in use, so a new one doesn't collide. */
  takenIds: string[];
  onSave: (source: CustomSource) => void;
  onCancel: () => void;
};

const MODE_HELP: Record<CustomSourceMode, string> = {
  regex:
    'Applied to each line. Use named groups: (?<name>…), (?<installed>…), (?<latest>…). Lines that don’t match are ignored.',
  tsv: 'Each line: name, installed, latest — separated by tabs. Use this to wrap anything in your own script.',
  json: 'Standard output is a JSON array of { "name": …, "installed": …, "latest": … } objects.'
};

/**
 * Starting points that teach the two shapes. Deliberately generic — the built-in
 * list is the app's opinion about what to track; these are just format examples.
 */
const EXAMPLES: Array<{ label: string; config: Omit<CustomSource, 'id'> }> = [
  {
    label: 'An `outdated` command',
    config: {
      label: 'My Packages',
      itemNoun: 'packages',
      command: 'yourtool',
      args: ['outdated'],
      mode: 'regex',
      // Matches the very common "name (1.0.0 < 2.0.0)" and "name (1.0.0 -> 2.0.0)".
      pattern: '^(?<name>\\S+)\\s+\\((?<installed>[^\\s<>-]+)\\s*(?:<|->)\\s*(?<latest>[^)]+)\\)',
      upgradeCommand: 'yourtool upgrade'
    }
  },
  {
    label: 'Your own script',
    config: {
      label: 'My Packages',
      itemNoun: 'packages',
      command: 'sh',
      args: ['-c', "printf 'example\\t1.0.0\\t1.2.0\\n'"],
      mode: 'tsv'
    }
  }
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueId(label: string, taken: string[]): CustomSourceId {
  const base = slugify(label) || 'source';
  let candidate = `custom:${base}`;
  let n = 2;
  while (taken.includes(candidate)) candidate = `custom:${base}-${n++}`;
  return candidate as CustomSourceId;
}

export default function CustomSourceForm({
  initial,
  takenIds,
  onSave,
  onCancel
}: Props): React.JSX.Element {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [itemNoun, setItemNoun] = useState(initial?.itemNoun ?? 'packages');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [argsText, setArgsText] = useState((initial?.args ?? []).join(' '));
  const [mode, setMode] = useState<CustomSourceMode>(initial?.mode ?? 'regex');
  const [pattern, setPattern] = useState(initial?.pattern ?? '');
  const [upgradeCommand, setUpgradeCommand] = useState(initial?.upgradeCommand ?? '');
  const [allowExit, setAllowExit] = useState((initial?.allowExitCodes ?? []).join(' '));
  const [listsOnlyUpdates, setListsOnlyUpdates] = useState(initial?.listsOnlyUpdates ?? false);
  const [test, setTest] = useState<CustomSourceTest | null>(null);
  const [testing, setTesting] = useState(false);

  const build = (): CustomSource => ({
    id: initial?.id ?? uniqueId(label, takenIds),
    label: label.trim(),
    itemNoun: itemNoun.trim() || 'items',
    command: command.trim(),
    args: splitArgs(argsText),
    mode,
    ...(mode === 'regex' ? { pattern: pattern.trim() } : {}),
    ...(upgradeCommand.trim() ? { upgradeCommand: upgradeCommand.trim() } : {}),
    ...(splitArgs(allowExit).length
      ? { allowExitCodes: splitArgs(allowExit).map(Number).filter(Number.isInteger) }
      : {}),
    ...(listsOnlyUpdates ? { listsOnlyUpdates: true } : {})
  });

  const applyExample = (config: Omit<CustomSource, 'id'>): void => {
    setLabel(config.label);
    setItemNoun(config.itemNoun);
    setCommand(config.command);
    setArgsText(config.args.join(' '));
    setMode(config.mode);
    setPattern(config.pattern ?? '');
    setUpgradeCommand(config.upgradeCommand ?? '');
    setListsOnlyUpdates(config.listsOnlyUpdates ?? false);
    setTest(null);
  };

  const runTest = async (): Promise<void> => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await window.api.testCustomSource(build()));
    } catch (e) {
      setTest({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const valid =
    label.trim().length > 0 && command.trim().length > 0 && (mode !== 'regex' || pattern.trim());

  return (
    <div className="custom-form">
      <div className="custom-form-head">
        <strong>{initial ? `Edit ${initial.label}` : 'New custom source'}</strong>
        {!initial && (
          <div className="example-row">
            <span className="settings-help">Start from:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="ghost-button"
                onClick={() => applyExample(ex.config)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="setting-row">
        <span className="setting-row-label">Name</span>
        <input
          className="setting-input"
          value={label}
          placeholder="Mac App Store"
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>

      <label className="setting-row">
        <span className="setting-row-label">Items called</span>
        <input
          className="setting-input"
          value={itemNoun}
          placeholder="packages"
          onChange={(e) => setItemNoun(e.target.value)}
        />
      </label>

      <label className="setting-row">
        <span className="setting-row-label">Command</span>
        <input
          className="setting-input mono"
          value={command}
          spellCheck={false}
          placeholder="mas  (or an absolute path)"
          onChange={(e) => setCommand(e.target.value)}
        />
      </label>

      <label className="setting-row">
        <span className="setting-row-label">Arguments</span>
        <input
          className="setting-input mono"
          value={argsText}
          spellCheck={false}
          placeholder="outdated"
          onChange={(e) => setArgsText(e.target.value)}
        />
      </label>

      <label className="setting-row">
        <span className="setting-row-label">Output</span>
        <select
          className="setting-input"
          value={mode}
          onChange={(e) => setMode(e.target.value as CustomSourceMode)}
        >
          <option value="regex">Parse with a pattern</option>
          <option value="tsv">Tab-separated (name / installed / latest)</option>
          <option value="json">JSON array</option>
        </select>
      </label>

      <p className="settings-help custom-mode-help">{MODE_HELP[mode]}</p>

      {mode === 'regex' && (
        <label className="setting-row">
          <span className="setting-row-label">Pattern</span>
          <input
            className="setting-input mono"
            value={pattern}
            spellCheck={false}
            placeholder="^(?<name>\S+)\s+\((?<installed>\S+) -> (?<latest>\S+)\)"
            onChange={(e) => setPattern(e.target.value)}
          />
        </label>
      )}

      <label className="setting-row">
        <span className="setting-row-label">Upgrade cmd</span>
        <input
          className="setting-input mono"
          value={upgradeCommand}
          spellCheck={false}
          placeholder="optional — e.g. mas upgrade"
          onChange={(e) => setUpgradeCommand(e.target.value)}
        />
      </label>

      <label className="setting-row">
        <span className="setting-row-label">Exit codes</span>
        <input
          className="setting-input mono"
          value={allowExit}
          spellCheck={false}
          placeholder="optional — treat these as success, e.g. 1"
          onChange={(e) => setAllowExit(e.target.value)}
        />
      </label>

      <label className="setting-row setting-check">
        <input
          type="checkbox"
          checked={listsOnlyUpdates}
          onChange={(e) => setListsOnlyUpdates(e.target.checked)}
        />
        <span>
          This command lists only available updates
          <span className="settings-help">
            {' '}
            — every row it prints counts as outdated, even with no installed version.
          </span>
        </span>
      </label>

      {test && (
        <div className={`test-result ${test.ok ? 'test-ok' : 'test-bad'}`}>
          {test.ok ? (
            <strong>
              Parsed {test.totalItems} {test.totalItems === 1 ? 'row' : 'rows'}
            </strong>
          ) : (
            <strong>{test.error}</strong>
          )}
          {test.resolvedCommand && <div className="test-meta mono">ran {test.resolvedCommand}</div>}
          {test.items && test.items.length > 0 && (
            <table className="test-table">
              <tbody>
                {test.items.slice(0, 6).map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="mono">{p.installedVersion || '—'}</td>
                    <td className="mono">{p.latestVersion || '—'}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {test.rawSample && (
            <details>
              <summary>Raw output</summary>
              <pre className="test-raw">{test.rawSample}</pre>
            </details>
          )}
        </div>
      )}

      <div className="custom-form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="copy-button"
          onClick={() => void runTest()}
          disabled={!valid || testing}
        >
          {testing ? 'Running…' : 'Test'}
        </button>
        <button
          type="button"
          className="refresh-button"
          onClick={() => onSave(build())}
          disabled={!valid}
        >
          Save
        </button>
      </div>
    </div>
  );
}
