/**
 * Where the date of an extension comes from.
 *
 * The order of this union is the order of confidence: `install-recorded` is the
 * most trustworthy value, `unknown` means "we really have no idea". The tree
 * view always shows the source next to the date so a user can never mistake a
 * guess for a fact.
 */
export type InstallDateSource =
  /** `__metadata.installedTimestamp` written by VS Code when it installed the extension. */
  | 'install-recorded'
  /** Extension Sorter watched the extension appear while it was running. */
  | 'install-observed'
  /** Creation time (`birthtimeMs`) of the extension folder. An estimate. */
  | 'file-birthtime'
  /** Change time (`ctimeMs`) of the extension folder, used when birthtime is unusable. An estimate. */
  | 'file-ctime'
  /** First time Extension Sorter ever saw the extension. An observation, not an install date. */
  | 'first-seen'
  /** No usable date at all. */
  | 'unknown';

/** Short label rendered after the date in the tree view (e.g. `Oct 9, 2026 · Estimated`). */
export const INSTALL_DATE_SOURCE_LABELS: Readonly<Record<InstallDateSource, string>> = {
  'install-recorded': 'Installed',
  'install-observed': 'Installed',
  'file-birthtime': 'Estimated',
  'file-ctime': 'Estimated',
  'first-seen': 'First seen',
  unknown: 'Unknown',
};

/** Long explanation used in the hover tooltip. */
export const INSTALL_DATE_SOURCE_DETAILS: Readonly<Record<InstallDateSource, string>> = {
  'install-recorded': 'Install time recorded by VS Code for this extension version.',
  'install-observed': 'Extension Sorter saw this extension appear while it was running.',
  'file-birthtime': 'Estimated from the creation time of the extension folder.',
  'file-ctime': 'Estimated from the change time of the extension folder (creation time unusable).',
  'first-seen': 'First time Extension Sorter observed this extension - not the install time.',
  unknown: 'No usable date source: the extension folder could not be read and no install was observed.',
};

/** The date (if any) plus the label that explains where it came from. */
export interface InstallDateInfo {
  /** Epoch milliseconds, or `undefined` when nothing usable was found. */
  ms?: number;
  source: InstallDateSource;
}

/** A single row of the `Installed by Date` view. */
export interface SorterExtension {
  /** Lower case canonical id, e.g. `lilinhuang.extension-sorter`. */
  id: string;
  /** Display name from the manifest, falling back to the id. */
  name: string;
  publisher: string;
  version: string;
  description: string;
  /** `true` when the extension contributes color/icon themes. */
  isTheme: boolean;
  /** Number of color themes contributed by the extension (0 when not a theme extension). */
  themeCount: number;
  /** `true` for extensions shipped inside the VS Code installation. */
  isBuiltin: boolean;
  /** File system path of the extension folder ('' when the extension is not backed by a local file). */
  extensionPath: string;
  /** Absolute path of an on-disk icon file that actually exists. */
  iconPath?: string;
  /** Effective date used for sorting and display, in epoch milliseconds. */
  installDateMs?: number;
  installDateSource: InstallDateSource;
}

/** `true` when the entry takes part in date sorting (i.e. it is not `Unknown`). */
export function hasUsableInstallDate(extension: SorterExtension): boolean {
  return typeof extension.installDateMs === 'number' && extension.installDateSource !== 'unknown';
}
