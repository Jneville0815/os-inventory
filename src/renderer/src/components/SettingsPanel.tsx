import { useEffect, useMemo, useState } from 'react';
import type {
  CustomSource,
  Settings,
  SourceDescriptor,
  SourceId,
  ToolId
} from '../../../shared/types';
import CustomSourceForm from './CustomSourceForm';

type Props = {
  settings: Settings;
  sources: SourceDescriptor[];
  onChange: (next: Settings) => void;
  onClose: () => void;
};

/** A row in the "Available" list, whatever it's backed by. */
type AddableEntry = {
  key: string;
  label: string;
  description: string;
  supported: boolean;
  detected: boolean;
  /** Where the backing command was found. */
  detail?: string;
  hint?: string;
  onAdd: () => void;
};

const TOOL_LABEL: Record<ToolId, string> = {
  brew: 'Homebrew',
  npm: 'npm',
  pip: 'pip',
  gem: 'gem',
  cargo: 'Cargo',
  go: 'Go'
};

type SourceStatus = { text: string; tone: 'ok' | 'warn' | 'muted' };

function statusOf(source: SourceDescriptor): SourceStatus {
  if (!source.supported) {
    return { text: 'Not available on this operating system', tone: 'muted' };
  }
  if (source.detected) {
    return {
      text: source.toolPath ? `Found at ${source.toolPath}` : 'Ready',
      tone: 'ok'
    };
  }
  return {
    text: source.hint ? `Not found — ${source.hint}` : 'Not found on this machine',
    tone: 'warn'
  };
}

/**
 * Free-text path override. Kept in local state so typing isn't persisted on
 * every keystroke — committed on blur or Enter, which is also when detection re-runs.
 * The caller keys this on `value`, so a committed change remounts it with a fresh draft.
 */
function ToolPathField({
  toolId,
  detectedPath,
  value,
  onCommit
}: {
  toolId: ToolId;
  detectedPath?: string;
  value: string;
  onCommit: (next: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value);

  const commit = (): void => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };

  return (
    <label className="setting-row">
      <span className="setting-row-label">{TOOL_LABEL[toolId]}</span>
      <input
        type="text"
        className="setting-input mono"
        value={draft}
        spellCheck={false}
        placeholder={detectedPath ?? 'Not found — enter the full path'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
    </label>
  );
}

export default function SettingsPanel({
  settings,
  sources,
  onChange,
  onClose
}: Props): React.JSX.Element {
  // null = closed, 'new' = creating, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byId = useMemo(
    () => new Map(sources.map((s) => [s.id, s] as const)),
    [sources]
  );

  const tracked = settings.sources
    .map((id) => byId.get(id))
    .filter((s): s is SourceDescriptor => s !== undefined);

  // Everything addable: built-in package managers plus any custom source the
  // user has defined but isn't tracking yet.
  const available: AddableEntry[] = useMemo(
    () =>
      sources
        .filter((s) => !settings.sources.includes(s.id))
        .map((s) => ({
          key: s.id,
          label: s.label,
          description: s.description,
          supported: s.supported,
          detected: s.detected,
          detail: s.toolPath,
          hint: s.hint,
          onAdd: () => add(s.id)
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sources, settings]
  );

  // Lead with what's actually on this machine — a list full of "not found"
  // reads as the app telling you what you ought to have installed.
  const detected = available.filter((e) => e.supported && e.detected);
  const undetected = available.filter((e) => !e.supported || !e.detected);

  // Only offer path overrides for tools something can actually use here.
  const toolIds = useMemo(() => {
    const ids = new Set<ToolId>();
    for (const s of sources) {
      if (s.supported && s.toolId) ids.add(s.toolId);
    }
    return [...ids];
  }, [sources]);

  const setSources = (next: SourceId[]): void => onChange({ ...settings, sources: next });

  const add = (id: SourceId): void => setSources([...settings.sources, id]);
  const remove = (id: SourceId): void =>
    setSources(settings.sources.filter((s) => s !== id));

  const move = (id: SourceId, delta: number): void => {
    const from = settings.sources.indexOf(id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= settings.sources.length) return;
    const next = [...settings.sources];
    [next[from], next[to]] = [next[to], next[from]];
    setSources(next);
  };

  const saveCustom = (source: CustomSource): void => {
    const existing = settings.customSources.findIndex((c) => c.id === source.id);
    const customSources = [...settings.customSources];
    if (existing === -1) customSources.push(source);
    else customSources[existing] = source;
    onChange({ ...settings, customSources });
    setEditing(null);
  };

  const deleteCustom = (id: string): void => {
    onChange({
      ...settings,
      customSources: settings.customSources.filter((c) => c.id !== id),
      // Drop the tab too — main would strip it anyway, this just keeps the UI honest.
      sources: settings.sources.filter((s) => s !== id)
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-section">
            <h3>Tracked</h3>
            <p className="settings-help">
              These become the tabs in the main window, in this order.
            </p>

            {tracked.length === 0 ? (
              <p className="settings-empty">
                Nothing tracked yet. Add something from the list below.
              </p>
            ) : (
              <ul className="source-list">
                {tracked.map((source, i) => {
                  const status = statusOf(source);
                  return (
                    <li key={source.id} className="source-item">
                      <div className="source-reorder">
                        <button
                          className="icon-button"
                          onClick={() => move(source.id, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${source.label} up`}
                        >
                          ↑
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => move(source.id, 1)}
                          disabled={i === tracked.length - 1}
                          aria-label={`Move ${source.label} down`}
                        >
                          ↓
                        </button>
                      </div>
                      <div className="source-text">
                        <div className="source-label">{source.label}</div>
                        <div className={`source-status source-status-${status.tone}`}>
                          {status.text}
                        </div>
                      </div>
                      <button className="ghost-button" onClick={() => remove(source.id)}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="settings-section">
            <h3>Found on this machine</h3>
            {detected.length === 0 ? (
              <p className="settings-empty">
                {available.length === 0
                  ? 'Everything is being tracked.'
                  : 'Nothing else detected here.'}
              </p>
            ) : (
              <ul className="source-list">
                {detected.map((entry) => (
                  <li key={entry.key} className="source-item">
                    <div className="source-text">
                      <div className="source-label">{entry.label}</div>
                      <div className="source-desc">{entry.description}</div>
                      {entry.detail && (
                        <div className="source-status source-status-ok">
                          Found at {entry.detail}
                        </div>
                      )}
                    </div>
                    <button className="add-button" onClick={entry.onAdd}>
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {undetected.length > 0 && (
              <>
                <button className="link-button" onClick={() => setShowAll(!showAll)}>
                  {showAll
                    ? 'Hide what isn’t installed'
                    : `Show ${undetected.length} more that aren’t installed here`}
                </button>

                {showAll && (
                  <ul className="source-list">
                    {undetected.map((entry) => (
                      <li key={entry.key} className="source-item source-item-dim">
                        <div className="source-text">
                          <div className="source-label">{entry.label}</div>
                          <div className="source-desc">{entry.description}</div>
                          <div className="source-status source-status-warn">
                            {!entry.supported
                              ? 'Not available on this operating system'
                              : (entry.hint ?? 'Not found on this machine')}
                          </div>
                        </div>
                        <button
                          className="add-button"
                          onClick={entry.onAdd}
                          disabled={!entry.supported}
                        >
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="settings-section">
            <h3>Custom sources</h3>
            <p className="settings-help">
              Track any package manager by naming a command and how to read its output.
              The command runs exactly as written — nothing goes through a shell.
            </p>

            {settings.customSources.length > 0 && (
              <ul className="source-list">
                {settings.customSources.map((custom) =>
                  editing === custom.id ? (
                    <li key={custom.id} className="source-item source-item-form">
                      <CustomSourceForm
                        initial={custom}
                        takenIds={settings.customSources.map((c) => c.id)}
                        onSave={saveCustom}
                        onCancel={() => setEditing(null)}
                      />
                    </li>
                  ) : (
                    <li key={custom.id} className="source-item">
                      <div className="source-text">
                        <div className="source-label">{custom.label}</div>
                        <div className="source-desc mono">
                          {[custom.command, ...custom.args].join(' ')}
                        </div>
                      </div>
                      <button className="ghost-button" onClick={() => setEditing(custom.id)}>
                        Edit
                      </button>
                      <button className="ghost-button" onClick={() => deleteCustom(custom.id)}>
                        Delete
                      </button>
                    </li>
                  )
                )}
              </ul>
            )}

            {editing === 'new' ? (
              <div className="source-item source-item-form">
                <CustomSourceForm
                  takenIds={settings.customSources.map((c) => c.id)}
                  onSave={saveCustom}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <button className="add-button custom-add" onClick={() => setEditing('new')}>
                Add a custom source
              </button>
            )}
          </section>

          {toolIds.length > 0 && (
            <section className="settings-section">
              <h3>Tool locations</h3>
              <p className="settings-help">
                Leave blank to auto-detect. Set a full path if a tool lives somewhere
                unusual.
              </p>
              {toolIds.map((toolId) => (
                <ToolPathField
                  key={`${toolId}:${settings.toolPaths[toolId] ?? ''}`}
                  toolId={toolId}
                  detectedPath={sources.find((s) => s.toolId === toolId && s.detected)?.toolPath}
                  value={settings.toolPaths[toolId] ?? ''}
                  onCommit={(next) => {
                    const toolPaths = { ...settings.toolPaths };
                    if (next) toolPaths[toolId] = next;
                    else delete toolPaths[toolId];
                    onChange({ ...settings, toolPaths });
                  }}
                />
              ))}
            </section>
          )}

          <section className="settings-section">
            <h3>Refresh</h3>
            <label className="setting-row">
              <span className="setting-row-label">Automatically</span>
              <select
                className="setting-input"
                value={settings.autoRefreshMinutes}
                onChange={(e) =>
                  onChange({ ...settings, autoRefreshMinutes: Number(e.target.value) })
                }
              >
                <option value={0}>Never — refresh manually</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
                <option value={360}>Every 6 hours</option>
                <option value={1440}>Once a day</option>
              </select>
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
