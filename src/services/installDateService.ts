import { promises as fs } from 'fs';
import * as path from 'path';
import { InstallDateInfo } from '../models/extensionInfo';
import { asRecord, readExtensionMetadata } from '../models/extensionManifest';
import { InstallHistoryEntry } from './installHistoryService';

/**
 * Install date estimation.
 *
 * The VS Code extension API does not expose the moment at which an extension
 * was installed, so the date shown in the view is always the best available
 * *evidence* combined with a label that tells the user what that evidence is:
 *
 * 1. `__metadata.installedTimestamp` - written by VS Code when it installs or
 *    updates an extension. This is the only real install timestamp we can get.
 * 2. An install that Extension Sorter observed itself while it was running.
 * 3. The creation time (`birthtimeMs`) of the extension folder. Note that this
 *    is the time the *current version folder* was created: re-installing,
 *    migrating a profile or restoring a backup changes it.
 * 4. The change time (`ctimeMs`) for file systems without a usable birthtime.
 * 5. The first time Extension Sorter saw the extension (an observation only).
 *
 * `mtime` is never used: the modification time of an extension folder changes
 * whenever files are added or removed and is not an install date.
 */

export interface FileTimes {
  birthtimeMs: number;
  ctimeMs: number;
  mtimeMs: number;
}

/** VS Code 1.0 was released on 2015-04-29, nothing can be older than that. */
export const MIN_PLAUSIBLE_TIME = Date.UTC(2015, 3, 29);

/** Tolerated clock skew into the future (a file can be "newer" than our clock). */
export const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/** A folder created within this window of an observed install proves the install. */
export const OBSERVED_INSTALL_WINDOW_MS = 10 * 60 * 1000;

/** Rejects 0, NaN, dates before VS Code existed and dates in the future. */
export function isPlausibleTime(value: unknown, now: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_TIME &&
    value <= now + FUTURE_TOLERANCE_MS
  );
}

/**
 * Picks the best file system timestamp, preferring the creation time.
 * `mtimeMs` is intentionally never returned.
 */
export function pickFileTime(
  times: FileTimes | undefined,
  now: number,
): { ms: number; source: 'file-birthtime' | 'file-ctime' } | undefined {
  if (!times) {
    return undefined;
  }
  if (isPlausibleTime(times.birthtimeMs, now)) {
    return { ms: times.birthtimeMs, source: 'file-birthtime' };
  }
  if (isPlausibleTime(times.ctimeMs, now)) {
    return { ms: times.ctimeMs, source: 'file-ctime' };
  }
  return undefined;
}

export interface ResolveInstallDateInput {
  /** `__metadata.installedTimestamp` recorded by VS Code. */
  recordedTimestamp?: number;
  /** Timestamp of an install Extension Sorter observed itself. */
  observedInstallTimestamp?: number;
  /** File system times of the extension folder, when it could be read. */
  fileTimes?: FileTimes;
  /** First time Extension Sorter saw the extension. */
  firstSeenTimestamp?: number;
  now: number;
}

/**
 * Pure decision table: turns every piece of available evidence into the single
 * date (and its label) that the UI uses. Order matters - see the file header.
 */
export function resolveInstallDate(input: ResolveInstallDateInput): InstallDateInfo {
  const { now } = input;
  if (isPlausibleTime(input.recordedTimestamp, now)) {
    return { ms: input.recordedTimestamp, source: 'install-recorded' };
  }
  if (isPlausibleTime(input.observedInstallTimestamp, now)) {
    return { ms: input.observedInstallTimestamp, source: 'install-observed' };
  }
  const fromFileSystem = pickFileTime(input.fileTimes, now);
  if (fromFileSystem) {
    return { ms: fromFileSystem.ms, source: fromFileSystem.source };
  }
  if (isPlausibleTime(input.firstSeenTimestamp, now)) {
    return { ms: input.firstSeenTimestamp, source: 'first-seen' };
  }
  return { source: 'unknown' };
}

/**
 * Reads the timestamps that make up an `install-recorded` date.
 * Returns `undefined` when the folder cannot be read (remote, virtual file
 * system, permissions, deleted folder, ...). Never throws.
 */
export class InstallDateService {
  private readonly fileTimes = new Map<string, FileTimes | undefined>();
  private readonly recorded = new Map<string, number | undefined>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Forgets cached values so that a manual refresh re-reads the disk. */
  clearCache(): void {
    this.fileTimes.clear();
    this.recorded.clear();
  }

  async readFileTimes(folder: string): Promise<FileTimes | undefined> {
    if (!folder) {
      return undefined;
    }
    if (this.fileTimes.has(folder)) {
      return this.fileTimes.get(folder);
    }
    let result: FileTimes | undefined;
    try {
      const stats = await fs.stat(folder);
      result = { birthtimeMs: stats.birthtimeMs, ctimeMs: stats.ctimeMs, mtimeMs: stats.mtimeMs };
    } catch {
      result = undefined;
    }
    this.fileTimes.set(folder, result);
    return result;
  }

  /**
   * `__metadata.installedTimestamp` of an installed extension.
   *
   * The manifest handed out by the API usually already contains `__metadata`;
   * when it does not, the installed `package.json` is read from disk (that is
   * exactly the file VS Code wrote the value into). The result is cached per
   * extension folder, and the folder name contains the version, so an update
   * naturally invalidates the cache.
   */
  async readRecordedInstallTimestamp(extensionPath: string, manifest?: unknown): Promise<number | undefined> {
    const fromManifest = readExtensionMetadata(manifest)?.installedTimestamp;
    if (typeof fromManifest === 'number') {
      return fromManifest;
    }
    if (!extensionPath) {
      return undefined;
    }
    if (this.recorded.has(extensionPath)) {
      return this.recorded.get(extensionPath);
    }
    let value: number | undefined;
    try {
      const content = await fs.readFile(path.join(extensionPath, 'package.json'), 'utf8');
      const parsed = asRecord(JSON.parse(content));
      const timestamp = readExtensionMetadata(parsed)?.installedTimestamp;
      value = typeof timestamp === 'number' ? timestamp : undefined;
    } catch {
      value = undefined;
    }
    this.recorded.set(extensionPath, value);
    return value;
  }

  /** Combines every source for one extension into a single labelled date. */
  async resolveFor(
    source: { extensionPath: string; packageJSON?: unknown; fileSystemReadable: boolean },
    historyEntry: InstallHistoryEntry | undefined,
    now: number = this.now(),
  ): Promise<InstallDateInfo> {
    const fileTimes = source.fileSystemReadable ? await this.readFileTimes(source.extensionPath) : undefined;
    const recordedTimestamp = source.fileSystemReadable
      ? await this.readRecordedInstallTimestamp(source.extensionPath, source.packageJSON)
      : undefined;
    return resolveInstallDate({
      recordedTimestamp,
      observedInstallTimestamp: historyEntry?.installObservedAt,
      fileTimes,
      firstSeenTimestamp: historyEntry?.firstSeenAt,
      now,
    });
  }
}
