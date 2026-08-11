import { useMemo, useState } from 'react';
import type { Package, PackageStatus } from '../../../shared/types';

type SortKey = 'name' | 'installedVersion' | 'latestVersion' | 'status';
type SortDir = 'asc' | 'desc';

type Props = {
  packages: Package[];
  filter: string;
};

const STATUS_BADGE: Record<
  PackageStatus,
  { label: string; className: string; title?: string }
> = {
  outdated: { label: 'outdated', className: 'badge-outdated' },
  held: {
    label: 'held',
    className: 'badge-pinned',
    title: 'Deliberately frozen at this version'
  },
  current: { label: 'up to date', className: 'badge-ok' },
  unknown: {
    label: 'unknown',
    className: 'badge-muted',
    title: 'No update feed available for this item'
  }
};

const STATUS_RANK: Record<PackageStatus, number> = {
  outdated: 0,
  held: 1,
  current: 2,
  unknown: 3
};

const TONE_CLASS = {
  ok: 'badge-ok',
  warn: 'badge-outdated',
  info: 'badge-info',
  muted: 'badge-muted'
} as const;

function sortLabel(p: Package): string {
  return (p.displayName ?? p.name).toLowerCase();
}

export default function PackageTable({ packages, filter }: Props): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const filtered = needle
      ? packages.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            (p.displayName?.toLowerCase().includes(needle) ?? false) ||
            (p.description?.toLowerCase().includes(needle) ?? false)
        )
      : packages;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'status') {
        cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (cmp === 0) cmp = sortLabel(a).localeCompare(sortLabel(b));
      } else if (sortKey === 'name') {
        cmp = sortLabel(a).localeCompare(sortLabel(b));
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base'
        });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [packages, filter, sortKey, sortDir]);

  const toggleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const arrow = (key: SortKey): string =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  if (rows.length === 0) {
    return <div className="empty">No packages match.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="formula-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort('name')}>Name{arrow('name')}</th>
            <th onClick={() => toggleSort('installedVersion')}>
              Installed{arrow('installedVersion')}
            </th>
            <th onClick={() => toggleSort('latestVersion')}>Latest{arrow('latestVersion')}</th>
            <th onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const badge = STATUS_BADGE[p.status];
            return (
              <tr
                key={p.name}
                className={
                  p.status === 'outdated'
                    ? 'row-outdated'
                    : p.status === 'held'
                      ? 'row-pinned'
                      : ''
                }
              >
                <td>
                  <div className="cell-name">
                    {p.displayName && p.displayName !== p.name ? (
                      <>
                        {p.displayName} <span className="cell-token">({p.name})</span>
                      </>
                    ) : (
                      p.name
                    )}
                  </div>
                  {p.description && <div className="cell-desc">{p.description}</div>}
                </td>
                <td className="mono">{p.installedVersion || '—'}</td>
                <td className="mono">{p.latestVersion || '—'}</td>
                <td>
                  <div className="badge-stack">
                    <span className={`badge ${badge.className}`} title={badge.title}>
                      {badge.label}
                    </span>
                    {p.badges?.map((b) => (
                      <span
                        key={b.label}
                        className={`badge ${TONE_CLASS[b.tone]}`}
                        title={b.title}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
