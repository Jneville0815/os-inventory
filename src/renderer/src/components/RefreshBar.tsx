import { useEffect, useState } from 'react';
import type { RefreshProgress } from '../../../shared/types';

type Status = 'loading' | 'idle' | 'refreshing' | 'error';

type Props = {
  status: Status;
  progress: RefreshProgress | null;
  refreshedAt: string | null;
  totalCount: number;
  outdatedCount: number;
  disabled: boolean;
  onRefresh: () => void;
};

function relativeTime(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function progressLabel(progress: RefreshProgress): string {
  const detail = progress.note ? `${progress.label} · ${progress.note}` : progress.label;
  return `${detail} (${progress.completed}/${progress.total})`;
}

export default function RefreshBar({
  status,
  progress,
  refreshedAt,
  totalCount,
  outdatedCount,
  disabled,
  onRefresh
}: Props): React.JSX.Element {
  const busy = status === 'refreshing';

  // Keeps the "updated 5m ago" label honest without a re-render storm.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="refresh-bar">
      <div className="refresh-meta">
        {busy && progress ? (
          <span className="muted">{progressLabel(progress)}</span>
        ) : refreshedAt ? (
          <>
            <span>{totalCount} packages</span>
            <span className={outdatedCount > 0 ? 'outdated-count' : ''}>
              {outdatedCount} outdated
            </span>
            <span className="muted">updated {relativeTime(refreshedAt)}</span>
          </>
        ) : (
          <span className="muted">no snapshot yet</span>
        )}
      </div>
      <button
        className="refresh-button"
        onClick={onRefresh}
        disabled={busy || disabled || status === 'loading'}
      >
        {busy && <span className="spinner" aria-hidden />}
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
