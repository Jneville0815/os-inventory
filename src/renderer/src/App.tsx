import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RecipeDescriptor,
  RefreshProgress,
  Settings,
  Snapshot,
  SourceDescriptor,
  SourceId
} from '../../shared/types';
import RefreshBar from './components/RefreshBar';
import PackageTable from './components/PackageTable';
import CopyCommandButton from './components/CopyCommandButton';
import SettingsPanel from './components/SettingsPanel';

type Status = 'loading' | 'idle' | 'refreshing' | 'error';

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sources, setSources] = useState<SourceDescriptor[]>([]);
  const [recipes, setRecipes] = useState<RecipeDescriptor[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [progress, setProgress] = useState<RefreshProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<SourceId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      window.api.getSnapshot(),
      window.api.getSettings(),
      window.api.listSources(),
      window.api.listRecipes()
    ])
      .then(([snap, loaded, descriptors, library]) => {
        setSnapshot(snap);
        setSettings(loaded);
        setSources(descriptors);
        setRecipes(library);
        setStatus('idle');
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => window.api.onProgress(setProgress), []);

  const onRefresh = useCallback(async () => {
    setStatus('refreshing');
    setError(null);
    try {
      setSnapshot(await window.api.refresh());
      setStatus('idle');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    } finally {
      setProgress(null);
    }
  }, []);

  const applySettings = useCallback(async (next: Settings) => {
    // Applied optimistically: the panel edits build on each other, so waiting for
    // the round-trip would let two quick clicks race and drop the first one.
    setSettings(next);
    setSettings(await window.api.saveSettings(next));
    // Re-detect: a corrected tool path should show up immediately.
    setSources(await window.api.listSources());
  }, []);

  // Tabs are exactly the tracked sources, in the user's order, minus any that
  // can't run on this OS.
  const tabs = useMemo(() => {
    if (!settings) return [];
    const byId = new Map(sources.map((s) => [s.id, s] as const));
    return settings.sources
      .map((id) => byId.get(id))
      .filter((s): s is SourceDescriptor => s !== undefined && s.supported);
  }, [settings, sources]);

  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[0] ?? null;
  const activeResult = activeTab ? (snapshot?.sources[activeTab.id] ?? null) : null;

  const { totalCount, outdatedCount } = useMemo(() => {
    let total = 0;
    let outdated = 0;
    for (const t of tabs) {
      const result = snapshot?.sources[t.id];
      if (!result) continue;
      total += result.items.length;
      outdated += result.items.filter((p) => p.status === 'outdated').length;
    }
    return { totalCount: total, outdatedCount: outdated };
  }, [tabs, snapshot]);

  // Latest-value refs so the auto-refresh timer doesn't need to be torn down and
  // rebuilt on every render.
  const onRefreshRef = useRef(onRefresh);
  const statusRef = useRef(status);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
    statusRef.current = status;
  });

  const autoRefreshMinutes = settings?.autoRefreshMinutes ?? 0;
  const trackedCount = settings?.sources.length ?? 0;

  useEffect(() => {
    if (autoRefreshMinutes <= 0 || trackedCount === 0) return;
    const id = window.setInterval(
      () => {
        if (statusRef.current !== 'refreshing') void onRefreshRef.current();
      },
      autoRefreshMinutes * 60 * 1000
    );
    return () => window.clearInterval(id);
  }, [autoRefreshMinutes, trackedCount]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    // Anything newly tracked — or previously broken and now fixed — has no good
    // data yet, so go get it rather than showing an empty tab.
    const stale = (settings?.sources ?? []).some(
      (id) => snapshot?.sources[id]?.state !== 'ok'
    );
    if (stale && statusRef.current !== 'refreshing') void onRefreshRef.current();
  }, [settings, snapshot]);

  const body = (): React.JSX.Element => {
    if (status === 'loading') return <div className="empty">Loading…</div>;

    if (tabs.length === 0) {
      return (
        <div className="empty empty-cta">
          <h2>Nothing tracked yet</h2>
          <p>Choose which package managers and app sources you want to keep an eye on.</p>
          <button className="refresh-button" onClick={() => setSettingsOpen(true)}>
            Choose what to track
          </button>
        </div>
      );
    }

    if (!activeResult) {
      return status === 'refreshing' ? (
        <div className="empty">Reading {activeTab?.label}…</div>
      ) : (
        <div className="empty">
          No data yet. Click <strong>Refresh</strong> to query your machine.
        </div>
      );
    }

    if (activeResult.state === 'error') {
      return (
        <div className="empty empty-cta">
          <h2>{activeTab?.label} couldn’t be read</h2>
          <p className="source-error">{activeResult.error}</p>
          <button className="refresh-button" onClick={() => setSettingsOpen(true)}>
            Open settings
          </button>
        </div>
      );
    }

    return <PackageTable packages={activeResult.items} filter={filter} />;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>os-inventory</h1>
          <span className="app-subtitle">Package versions</span>
        </div>
        <div className="header-actions">
          <RefreshBar
            status={status}
            progress={progress}
            refreshedAt={snapshot?.refreshedAt ?? null}
            totalCount={totalCount}
            outdatedCount={outdatedCount}
            disabled={tabs.length === 0}
            onRefresh={onRefresh}
          />
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.6.74 1.03 1.38 1.09H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {tabs.length > 0 && (
        <>
          <nav className="tabs">
            {tabs.map((t) => {
              const result = snapshot?.sources[t.id];
              const outdated =
                result?.items.filter((p) => p.status === 'outdated').length ?? 0;
              return (
                <button
                  key={t.id}
                  className={`tab ${activeTab?.id === t.id ? 'tab-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {result?.state === 'error' ? (
                    <span className="tab-warn" title={result.error}>
                      !
                    </span>
                  ) : (
                    <span className="tab-count">{result?.items.length ?? 0}</span>
                  )}
                  {outdated > 0 && <span className="tab-badge">{outdated}</span>}
                </button>
              );
            })}
          </nav>

          <div className="toolbar">
            <input
              type="search"
              placeholder={`Filter ${activeTab?.itemNoun ?? 'packages'}…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="filter-input"
            />
            <CopyCommandButton command={activeResult?.upgradeCommand ?? null} />
          </div>
        </>
      )}

      {body()}

      {settingsOpen && settings && (
        <SettingsPanel
          settings={settings}
          sources={sources}
          recipes={recipes}
          onChange={(next) => void applySettings(next)}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}

export default App;
