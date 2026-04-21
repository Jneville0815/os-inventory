import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Package,
  PackageKind,
  RefreshProgress,
  Snapshot
} from '../../shared/types';
import RefreshBar from './components/RefreshBar';
import PackageTable from './components/PackageTable';

type Status = 'loading' | 'idle' | 'refreshing' | 'error';

type TabDef = {
  kind: PackageKind;
  label: string;
  filterNoun: string;
};

const TABS: TabDef[] = [
  { kind: 'formula', label: 'Brew Formulae', filterNoun: 'formulae' },
  { kind: 'cask', label: 'Brew Casks', filterNoun: 'casks' },
  { kind: 'npm-global', label: 'NPM Globals', filterNoun: 'packages' },
  { kind: 'pip-global', label: 'Pip Packages', filterNoun: 'packages' },
  { kind: 'vscode-extension', label: 'VS Code Extensions', filterNoun: 'extensions' },
  { kind: 'go-install', label: 'Go Binaries', filterNoun: 'binaries' },
  { kind: 'macos-app', label: 'Desktop Apps', filterNoun: 'apps' }
];

function countOutdated(items: Package[]): number {
  return items.filter((p) => p.outdated).length;
}

function itemsFor(snapshot: Snapshot | null, kind: PackageKind): Package[] {
  if (!snapshot) return [];
  switch (kind) {
    case 'formula':
      return snapshot.formulae;
    case 'cask':
      return snapshot.casks;
    case 'npm-global':
      return snapshot.npmGlobals ?? [];
    case 'pip-global':
      return snapshot.pipGlobals ?? [];
    case 'vscode-extension':
      return snapshot.vscodeExtensions ?? [];
    case 'go-install':
      return snapshot.goBinaries ?? [];
    case 'macos-app':
      return snapshot.macosApps ?? [];
  }
}

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [progress, setProgress] = useState<RefreshProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<PackageKind>('formula');

  useEffect(() => {
    window.api
      .getSnapshot()
      .then((s) => {
        setSnapshot(s);
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
    setProgress({ phase: 'updating-taps' });
    try {
      const next = await window.api.refresh();
      setSnapshot(next);
      setStatus('idle');
      setProgress(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
      setProgress(null);
    }
  }, []);

  const totalOutdated = useMemo(
    () => TABS.reduce((sum, t) => sum + countOutdated(itemsFor(snapshot, t.kind)), 0),
    [snapshot]
  );
  const activeTab = TABS.find((t) => t.kind === tab) ?? TABS[0];
  const activeItems = itemsFor(snapshot, tab);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>os-inventory</h1>
          <span className="app-subtitle">Package versions</span>
        </div>
        <RefreshBar
          status={status}
          progress={progress}
          snapshot={snapshot}
          outdatedCount={totalOutdated}
          onRefresh={onRefresh}
        />
      </header>

      {error && <div className="error">{error}</div>}

      <nav className="tabs">
        {TABS.map((t) => {
          const items = itemsFor(snapshot, t.kind);
          const outdated = countOutdated(items);
          return (
            <button
              key={t.kind}
              className={`tab ${tab === t.kind ? 'tab-active' : ''}`}
              onClick={() => setTab(t.kind)}
            >
              {t.label} <span className="tab-count">{items.length}</span>
              {outdated > 0 && <span className="tab-badge">{outdated}</span>}
            </button>
          );
        })}
      </nav>

      <div className="toolbar">
        <input
          type="search"
          placeholder={`Filter ${activeTab.filterNoun}...`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
        />
      </div>

      {status === 'loading' ? (
        <div className="empty">Loading…</div>
      ) : snapshot ? (
        <PackageTable packages={activeItems} filter={filter} />
      ) : (
        <div className="empty">
          No snapshot yet. Click <strong>Refresh</strong> to query your machine.
        </div>
      )}
    </div>
  );
}

export default App;
