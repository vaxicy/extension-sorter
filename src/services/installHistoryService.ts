/**
 * "First seen" bookkeeping.
 *
 * VS Code cannot tell us when an extension was installed, so for extensions
 * that were already installed before this tool existed we only ever *observe*
 * them. Observations are stored separately from dates so the UI can never
 * present an observation as an install time.
 *
 * Everything in this file except `InstallHistoryService` is pure and unit
 * tested; the service is a thin wrapper around `ExtensionContext.globalState`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const HISTORY_STORAGE_KEY = 'extensionSorter.installHistory';

/** Records of extensions that were uninstalled long ago are dropped. */
export const DEFAULT_RETENTION_DAYS = 180;

/** Hard cap so `globalState` cannot grow without bound. */
export const MAX_HISTORY_ENTRIES = 2000;

export interface InstallHistoryEntry {
  /** First time Extension Sorter saw this extension (epoch ms). */
  firstSeenAt: number;
  /** Last time Extension Sorter saw this extension (epoch ms), used for pruning. */
  lastSeenAt: number;
  /** Version that was installed when the extension was first seen. */
  firstSeenVersion?: string;
  /** Set only when Extension Sorter actually watched the extension being installed. */
  installObservedAt?: number;
}

export type InstallHistory = Record<string, InstallHistoryEntry>;

export interface ExtensionSnapshotEntry {
  id: string;
  version: string;
}

/** `Memento`-shaped storage, narrowed so this module stays free of `vscode`. */
export interface MementoLike {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void> | void;
}

export type MaybePromise<T> = T | PromiseLike<T>;

/** Lower case id, the only key format ever written to storage. */
export function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * Defensive read of persisted data: `globalState` is shared with older/newer
 * versions of the extension and may contain anything.
 */
export function sanitizeHistory(raw: unknown): InstallHistory {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const result: InstallHistory = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      continue;
    }
    const entry = value as Record<string, unknown>;
    const firstSeenAt = entry['firstSeenAt'];
    const lastSeenAt = entry['lastSeenAt'];
    if (typeof firstSeenAt !== 'number' || !Number.isFinite(firstSeenAt)) {
      continue;
    }
    const id = normalizeId(key);
    if (!id) {
      continue;
    }
    const sanitized: InstallHistoryEntry = {
      firstSeenAt,
      lastSeenAt: typeof lastSeenAt === 'number' && Number.isFinite(lastSeenAt) ? lastSeenAt : firstSeenAt,
    };
    const version = entry['firstSeenVersion'];
    if (typeof version === 'string' && version.length > 0) {
      sanitized.firstSeenVersion = version;
    }
    const observed = entry['installObservedAt'];
    if (typeof observed === 'number' && Number.isFinite(observed)) {
      sanitized.installObservedAt = observed;
    }
    result[id] = sanitized;
  }
  return result;
}

/**
 * Drops records of extensions that have not been seen for `retentionDays` and
 * enforces the hard cap. Currently installed extensions always survive because
 * they were just seen (`lastSeenAt === now`).
 */
export function pruneHistory(history: InstallHistory, now: number, retentionDays: number): InstallHistory {
  const retention = Math.max(1, retentionDays) * DAY_MS;
  const kept = Object.entries(history).filter(([, entry]) => now - entry.lastSeenAt <= retention);
  kept.sort((a, b) => b[1].lastSeenAt - a[1].lastSeenAt);
  return Object.fromEntries(kept.slice(0, MAX_HISTORY_ENTRIES));
}

export interface MergeSnapshotOptions {
  /**
   * `true` for the very first scan after activation. During that scan newly
   * seen extensions are recorded as "first seen" only: they may have been
   * installed while VS Code was closed, so we must not claim to know when.
   */
  initialScan: boolean;
  now: number;
  retentionDays: number;
  /**
   * Ids that appeared while Extension Sorter was running *and* whose folder was
   * created moments ago - the only situation that counts as an observed install.
   */
  observedInstallIds?: ReadonlySet<string>;
}

/**
 * Folds the current extension list into the history.
 *
 * - Unknown extensions are recorded with `firstSeenAt = now`.
 * - Known extensions keep their `firstSeenAt`: updating an extension does not
 *   reset the observation, and re-reading storage never overwrites old data.
 * - `installObservedAt`, once recorded, is never cleared or moved.
 */
export function mergeSnapshot(
  history: InstallHistory,
  snapshot: readonly ExtensionSnapshotEntry[],
  options: MergeSnapshotOptions,
): InstallHistory {
  const { now, initialScan, observedInstallIds } = options;
  const next: InstallHistory = { ...history };

  for (const item of snapshot) {
    const id = normalizeId(item.id);
    if (!id) {
      continue;
    }
    const existing = next[id];
    if (!existing) {
      next[id] = {
        firstSeenAt: now,
        lastSeenAt: now,
        ...(item.version ? { firstSeenVersion: item.version } : {}),
      };
    } else {
      next[id] = { ...existing, lastSeenAt: now };
    }
    if (!initialScan && observedInstallIds?.has(id)) {
      next[id] = { ...next[id], installObservedAt: now };
    }
  }

  return pruneHistory(next, now, options.retentionDays);
}

/** Storage backed history used by the extension host. */
export class InstallHistoryService {
  private history: InstallHistory = {};
  private retentionDays = DEFAULT_RETENTION_DAYS;

  constructor(private readonly memento: MementoLike) {}

  /** Reads and sanitizes the persisted history. Safe to call more than once. */
  load(retentionDays: number = DEFAULT_RETENTION_DAYS): InstallHistory {
    this.retentionDays = retentionDays;
    this.history = sanitizeHistory(this.memento.get<unknown>(HISTORY_STORAGE_KEY, {}));
    return this.history;
  }

  /** Read-only view of the current history. */
  get entries(): Readonly<InstallHistory> {
    return this.history;
  }

  get(id: string): InstallHistoryEntry | undefined {
    return this.history[normalizeId(id)];
  }

  /** Folds a scan into the history and persists the result. */
  async record(
    snapshot: readonly ExtensionSnapshotEntry[],
    options: { initialScan?: boolean; observedInstallIds?: ReadonlySet<string>; now?: number; retentionDays?: number } = {},
  ): Promise<InstallHistory> {
    const now = options.now ?? Date.now();
    const retentionDays = options.retentionDays ?? this.retentionDays;
    const mergeOptions: MergeSnapshotOptions = {
      initialScan: options.initialScan === true,
      now,
      retentionDays,
    };
    if (options.observedInstallIds && options.observedInstallIds.size > 0) {
      mergeOptions.observedInstallIds = options.observedInstallIds;
    }
    const next = mergeSnapshot(this.history, snapshot, mergeOptions);
    // Avoid pointless writes: only touch storage when something really changed.
    if (JSON.stringify(next) !== JSON.stringify(this.history)) {
      this.history = next;
      await this.memento.update(HISTORY_STORAGE_KEY, next);
    }
    return this.history;
  }
}
