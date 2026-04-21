import { useMemo, useState } from 'react';
import type { Package } from '../../../shared/types';

type SortKey = 'name' | 'installedVersion' | 'latestVersion' | 'status';
type SortDir = 'asc' | 'desc';

type Props = {
  packages: Package[];
  filter: string;
};

function statusRank(p: Package): number {
  if (p.outdated) return 0;
  if (p.pinned) return 1;
  return 2;
}

export default function PackageTable({
  packages,
  filter
}: Props): React.JSX.Element {
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

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'status') {
        cmp = statusRank(a) - statusRank(b);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(
          String(b[sortKey] ?? ''),
          undefined,
          { numeric: true, sensitivity: 'base' }
        );
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
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
            <th onClick={() => toggleSort('latestVersion')}>
              Latest{arrow('latestVersion')}
            </th>
            <th onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.name}
              className={p.outdated ? 'row-outdated' : p.pinned ? 'row-pinned' : ''}
            >
              <td>
                <div className="cell-name">
                  {p.displayName && p.displayName !== p.name ? (
                    <>
                      {p.displayName}{' '}
                      <span className="cell-token">({p.name})</span>
                    </>
                  ) : (
                    p.name
                  )}
                </div>
                {p.description && (
                  <div className="cell-desc">{p.description}</div>
                )}
              </td>
              <td className="mono">{p.installedVersion || '—'}</td>
              <td className="mono">{p.latestVersion || '—'}</td>
              <td>
                <div className="badge-stack">
                  {p.outdated ? (
                    <span className="badge badge-outdated">outdated</span>
                  ) : p.pinned ? (
                    <span className="badge badge-pinned">pinned</span>
                  ) : (
                    <span className="badge badge-ok">up to date</span>
                  )}
                  {p.autoUpdates && (
                    <span
                      className="badge badge-info"
                      title="App self-updates — brew's version tracking may lag"
                    >
                      self-updates
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
