export type PackageKind =
  | 'formula'
  | 'cask'
  | 'npm-global'
  | 'vscode-extension'
  | 'go-install'
  | 'macos-app';

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
  vscodeExtensions: Package[];
  goBinaries: Package[];
  macosApps: Package[];
};

export type RefreshPhase =
  | 'updating-taps'
  | 'querying-brew'
  | 'querying-npm'
  | 'querying-vscode'
  | 'querying-go'
  | 'querying-apps'
  | 'writing-cache';

export type RefreshProgress = {
  phase: RefreshPhase;
};

export type OsInventoryApi = {
  getSnapshot: () => Promise<Snapshot | null>;
  refresh: () => Promise<Snapshot>;
  onProgress: (cb: (progress: RefreshProgress) => void) => () => void;
};
