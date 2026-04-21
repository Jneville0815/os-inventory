export type PackageKind =
  | 'formula'
  | 'cask'
  | 'npm-global'
  | 'pip-global'
  | 'vscode-extension'
  | 'go-install';

export type Package = {
  kind: PackageKind;
  name: string;
  displayName?: string;
  description?: string;
  installedVersion: string;
  latestVersion: string;
  outdated: boolean;
  pinned?: boolean;
  autoUpdates?: boolean;
};

export type Snapshot = {
  refreshedAt: string;
  formulae: Package[];
  casks: Package[];
  npmGlobals: Package[];
  pipGlobals: Package[];
  vscodeExtensions: Package[];
  goBinaries: Package[];
};

export type RefreshPhase =
  | 'updating-taps'
  | 'querying-brew'
  | 'querying-npm'
  | 'querying-pip'
  | 'querying-vscode'
  | 'querying-go'
  | 'writing-cache';

export type RefreshProgress = {
  phase: RefreshPhase;
};

export type OsInventoryApi = {
  getSnapshot: () => Promise<Snapshot | null>;
  refresh: () => Promise<Snapshot>;
  onProgress: (cb: (progress: RefreshProgress) => void) => () => void;
};
