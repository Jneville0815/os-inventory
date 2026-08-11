/**
 * Single source of truth for everything crossing the IPC boundary.
 * Included by both tsconfig.node.json and tsconfig.web.json.
 */

/** A package ecosystem the app knows how to inventory. */
export type SourceId =
  | 'homebrew-formula'
  | 'homebrew-cask'
  | 'npm-global'
  | 'vscode-extension'
  | 'go-install'
  | 'macos-app';

/** An external CLI a source shells out to. Users can override where it lives. */
export type ToolId = 'brew' | 'npm' | 'code' | 'go';

/**
 * `unknown` means we found no update feed for this item, so we can't claim it's
 * current. `held` means the user has deliberately frozen it (brew pin, and later
 * `apt-mark hold` / `winget pin`).
 */
export type PackageStatus = 'outdated' | 'current' | 'held' | 'unknown';

export type BadgeTone = 'ok' | 'warn' | 'info' | 'muted';

/** Extra, source-specific annotations shown next to the status. */
export type Badge = {
  label: string;
  tone: BadgeTone;
  title?: string;
};

export type Package = {
  sourceId: SourceId;
  name: string;
  displayName?: string;
  description?: string;
  installedVersion: string;
  latestVersion: string;
  status: PackageStatus;
  badges?: Badge[];
};

/**
 * The outcome of refreshing one source. A source that fails is recorded as an
 * error here rather than failing the whole refresh — one dead network or missing
 * CLI must not take out the other tabs.
 */
export type SourceResult = {
  id: SourceId;
  refreshedAt: string;
  state: 'ok' | 'error';
  error?: string;
  items: Package[];
  /** Shell command that upgrades everything outdated. Absent when the source has no such concept. */
  upgradeCommand?: string;
};

export type Snapshot = {
  schema: 2;
  refreshedAt: string;
  sources: Partial<Record<SourceId, SourceResult>>;
};

/** What the settings panel needs to know about a source: what it is, and whether it can run here. */
export type SourceDescriptor = {
  id: SourceId;
  label: string;
  itemNoun: string;
  description: string;
  toolId?: ToolId;
  /** False when this source can't work on the current OS at all. */
  supported: boolean;
  /** True when the underlying CLI was found. */
  detected: boolean;
  toolPath?: string;
  /** Shown when the tool is missing, e.g. "Install Homebrew from brew.sh". */
  hint?: string;
};

export type Settings = {
  schema: 1;
  /**
   * Sources the user has chosen to track, in tab order. Empty by default —
   * nothing is inventoried until it's added in Settings.
   */
  sources: SourceId[];
  /** User overrides for where a CLI lives. Empty means auto-detect. */
  toolPaths: Partial<Record<ToolId, string>>;
  /** 0 disables the timer. */
  autoRefreshMinutes: number;
};

export type RefreshProgress = {
  sourceId: SourceId;
  label: string;
  state: 'running' | 'done' | 'error';
  /** Sub-step detail, e.g. "updating taps". */
  note?: string;
  completed: number;
  total: number;
};

export type OsInventoryApi = {
  getSnapshot: () => Promise<Snapshot | null>;
  refresh: () => Promise<Snapshot>;
  onProgress: (cb: (progress: RefreshProgress) => void) => () => void;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<Settings>;
  listSources: () => Promise<SourceDescriptor[]>;
};
