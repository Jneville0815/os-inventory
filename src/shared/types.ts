/**
 * Single source of truth for everything crossing the IPC boundary.
 * Included by both tsconfig.node.json and tsconfig.web.json.
 */

/**
 * The package managers shipped with the app.
 *
 * Scope rule: **package managers that install developer dependencies.** Not
 * applications, not their plugins, not OS software. That's what keeps the list
 * a category rather than somebody's personal setup — and it means "should we
 * add X?" is answerable without a judgment call.
 */
export type BuiltInSourceId =
  | 'homebrew-formula'
  | 'npm-global'
  | 'pip'
  | 'gem'
  | 'cargo-install'
  | 'go-install';

/** A source the user defined themselves. Always `custom:<slug>`. */
export type CustomSourceId = `custom:${string}`;

export type SourceId = BuiltInSourceId | CustomSourceId;

/**
 * How to turn a custom command's stdout into rows.
 * - `regex` — apply a pattern per line, reading named groups `name`,
 *   `installed` and `latest`. For parsing a manager's native output.
 * - `tsv` — each line is `name<TAB>installed<TAB>latest`. The escape hatch:
 *   a user script can produce this from anything.
 * - `json` — stdout is a JSON array of `{ name, installed, latest }`.
 */
export type CustomSourceMode = 'regex' | 'tsv' | 'json';

export type CustomSource = {
  id: CustomSourceId;
  label: string;
  itemNoun: string;
  /** Executable name or absolute path. Never a shell string — args stay separate. */
  command: string;
  args: string[];
  mode: CustomSourceMode;
  /** Required for `regex` mode. Named groups: name (required), installed, latest. */
  pattern?: string;
  /** Optional; shown behind the "Copy upgrade command" button. */
  upgradeCommand?: string;
  /** Exit codes to treat as success — `npm outdated`-style tools exit non-zero by design. */
  allowExitCodes?: number[];
  /**
   * The command lists *only* available updates, so every row it emits is
   * outdated by definition. Needed for tools like `softwareupdate -l` that
   * report what's available without saying what you currently have — without
   * this they'd read as "up to date", which is exactly backwards.
   */
  listsOnlyUpdates?: boolean;
};

/** Result of the Settings "Test" button: enough to write a pattern against. */
export type CustomSourceTest = {
  ok: boolean;
  error?: string;
  /** Where the command actually resolved to. */
  resolvedCommand?: string;
  /** First lines of raw stdout, so the user can see what they're matching. */
  rawSample?: string;
  /** Rows successfully parsed (capped for display). */
  items?: Package[];
  totalItems?: number;
};

/** An external CLI a source shells out to. Users can override where it lives. */
export type ToolId = 'brew' | 'npm' | 'pip' | 'gem' | 'cargo' | 'go';

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
  /** True for user-defined sources — Settings offers Edit/Delete for those. */
  isCustom: boolean;
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
  /** User-defined sources. Present here whether or not they're tracked. */
  customSources: CustomSource[];
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
  /** Runs a custom source once without saving it, for the Settings preview. */
  testCustomSource: (source: CustomSource) => Promise<CustomSourceTest>;
};
