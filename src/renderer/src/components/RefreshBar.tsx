import type { RefreshProgress, Snapshot } from '../../../shared/types';

type Status = 'loading' | 'idle' | 'refreshing' | 'error';

type Props = {
  status: Status;
  progress: RefreshProgress | null;
  snapshot: Snapshot | null;
  outdatedCount: number;
  onRefresh: () => void;
};

const PHASE_LABEL: Record<RefreshProgress['phase'], string> = {
  'updating-taps': 'Updating Homebrew taps…',
  'querying-brew': 'Reading Homebrew packages…',
  'querying-npm': 'Reading npm globals…',
  'querying-pip': 'Reading pip packages…',
  'querying-vscode': 'Reading VS Code extensions…',
  'querying-go': 'Reading Go binaries…',
  'writing-cache': 'Saving snapshot…'
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function totalPackages(snapshot: Snapshot): number {
  return (
    snapshot.formulae.length +
    snapshot.casks.length +
    (snapshot.npmGlobals?.length ?? 0) +
    (snapshot.pipGlobals?.length ?? 0) +
    (snapshot.vscodeExtensions?.length ?? 0) +
    (snapshot.goBinaries?.length ?? 0)
  );
}

export default function RefreshBar({
  status,
  progress,
  snapshot,
  outdatedCount,
  onRefresh
}: Props): React.JSX.Element {
  const busy = status === 'refreshing';
  const label = busy && progress ? PHASE_LABEL[progress.phase] : 'Refresh';

  return (
    <div className="refresh-bar">
      <div className="refresh-meta">
        {snapshot ? (
          <>
            <span>{totalPackages(snapshot)} packages</span>
            <span className={outdatedCount > 0 ? 'outdated-count' : ''}>
              {outdatedCount} outdated
            </span>
            <span className="muted">
              updated {relativeTime(snapshot.refreshedAt)}
            </span>
          </>
        ) : (
          <span className="muted">no snapshot yet</span>
        )}
      </div>
      <button
        className="refresh-button"
        onClick={onRefresh}
        disabled={busy || status === 'loading'}
      >
        {busy && <span className="spinner" aria-hidden />}
        {label}
      </button>
    </div>
  );
}
