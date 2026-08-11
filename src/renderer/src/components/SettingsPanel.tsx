import { useEffect, useMemo, useState } from 'react';
import type { Settings, SourceDescriptor, SourceId, ToolId } from '../../../shared/types';

type Props = {
  settings: Settings;
  sources: SourceDescriptor[];
  onChange: (next: Settings) => void;
  onClose: () => void;
};

const TOOL_LABEL: Record<ToolId, string> = {
  brew: 'Homebrew',
  npm: 'npm',
  code: 'VS Code',
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

  const available = sources.filter((s) => !settings.sources.includes(s.id));

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
            <h3>Available</h3>
            {available.length === 0 ? (
              <p className="settings-empty">Everything is being tracked.</p>
            ) : (
              <ul className="source-list">
                {available.map((source) => {
                  const status = statusOf(source);
                  return (
                    <li key={source.id} className="source-item">
                      <div className="source-text">
                        <div className="source-label">{source.label}</div>
                        <div className="source-desc">{source.description}</div>
                        <div className={`source-status source-status-${status.tone}`}>
                          {status.text}
                        </div>
                      </div>
                      <button
                        className="add-button"
                        onClick={() => add(source.id)}
                        disabled={!source.supported}
                      >
                        Add
                      </button>
                    </li>
                  );
                })}
              </ul>
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
