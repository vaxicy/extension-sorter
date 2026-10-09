import { SorterExtension } from './extensionInfo';
import { SortMode } from '../services/sortService';
import { formatAge, formatInstallDate, formatInstallDateTime, getInstallDateSourceDetail, getInstallDateSourceLabel } from './dateFormat';

/**
 * View model of the rich ("installed like the native list") webview view.
 *
 * Pure data: no `vscode` import, no HTML, no I/O - the webview provider only
 * turns this into markup and messages, and the unit tests can check every
 * grouping/truncation rule without starting an editor.
 */

/** How the rich list groups its rows. */
export type GroupBy = 'none' | 'month' | 'year';

export const GROUP_BY_VALUES: readonly GroupBy[] = ['none', 'month', 'year'];
export const DEFAULT_GROUP_BY: GroupBy = 'month';

export function isGroupBy(value: unknown): value is GroupBy {
  return typeof value === 'string' && (GROUP_BY_VALUES as readonly string[]).includes(value);
}

/** A single two-line row of the rich list. */
export interface RichListRow {
  id: string;
  name: string;
  /** Second line: `publisher · description · 12 color themes`. */
  subtitle: string;
  /** Right column, e.g. `Oct 9, 2026`. */
  dateText: string;
  /** `Installed`, `Estimated`, `First seen`, ... */
  dateSourceLabel: string;
  /** `true` when the date is exact, i.e. no badge is shown next to it. */
  dateIsExact: boolean;
  /** Plain text (not markdown) hover text. */
  tooltip: string;
  isTheme: boolean;
  isBuiltin: boolean;
  /** Webview URI of the extension icon, when it has one. */
  iconUri?: string;
}

export interface RichListGroup {
  /** Stable key (`2026-10`), empty for the ungrouped case. */
  key: string;
  /** `October 2026`, `2026`, `No install date`, or '' when ungrouped. */
  label: string;
  count: number;
  rows: RichListRow[];
}

export interface RichListModel {
  groups: RichListGroup[];
  /** Extensions in the list (after the filter, before nothing else). */
  total: number;
  /** Rows actually rendered. */
  shown: number;
  query: string;
  sortLabel: string;
  filterLabel: string;
  isFiltered: boolean;
  groupBy: GroupBy;
  emptyMessage?: string;
}

export interface RichListInput {
  /** Everything the view knows about, used for the counters. */
  all: readonly SorterExtension[];
  /** Already filtered and sorted (see `applyViewOptions`). */
  visible: readonly SorterExtension[];
  query: string;
  sortMode: SortMode;
  sortLabel: string;
  filterLabel: string;
  isFiltered: boolean;
  groupBy: GroupBy;
  /** Current time, injected so unit tests are stable. */
  now: number;
  /** Turns an extension icon on disk into a webview URI. */
  iconUri?: (extension: SorterExtension) => string | undefined;
}

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const NO_DATE_GROUP = 'No install date';

/** Collapses the whitespace of manifest descriptions that were written as a poem. */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildSubtitle(extension: SorterExtension): string {
  const parts = [extension.publisher];
  const description = collapse(extension.description);
  if (description.length > 0) {
    parts.push(description);
  } else if (extension.version) {
    parts.push(`v${extension.version}`);
  }
  if (extension.isTheme && extension.themeCount > 0) {
    parts.push(`${extension.themeCount} color theme${extension.themeCount === 1 ? '' : 's'}`);
  }
  if (extension.isBuiltin) {
    parts.push('Built-in');
  }
  return parts.join(' · ');
}

/**
 * Plain text hover. Deliberately not markdown: the webview shows it as the
 * native `title` attribute, which renders no formatting at all.
 */
export function buildPlainTooltip(extension: SorterExtension, now: number): string {
  const sourceLabel = getInstallDateSourceLabel(extension.installDateSource);
  const age = formatAge(extension.installDateMs, now);
  const dateText =
    typeof extension.installDateMs === 'number'
      ? `${formatInstallDateTime(extension.installDateMs)} - ${sourceLabel}${age ? ` (${age})` : ''}`
      : `${formatInstallDate(undefined)} - ${sourceLabel}`;

  const lines = [extension.name, extension.id, ''];
  lines.push(`Publisher: ${extension.publisher}`);
  if (extension.version) {
    lines.push(`Version: ${extension.version}`);
  }
  lines.push(`Date: ${dateText}`);
  lines.push(`Date source: ${getInstallDateSourceDetail(extension.installDateSource)}`);
  if (extension.isTheme) {
    lines.push(
      extension.themeCount > 0
        ? `Themes: ${extension.themeCount} color theme${extension.themeCount === 1 ? '' : 's'}`
        : 'Themes: icon or product icon theme',
    );
  }
  if (extension.isBuiltin) {
    lines.push('Built-in: yes');
  }
  if (extension.description) {
    lines.push('', collapse(extension.description));
  }
  if (extension.extensionPath) {
    lines.push('', extension.extensionPath);
  }
  return lines.join('\n');
}

/** `2026-10` / `2026` / `none` - the group a row belongs to. */
function groupOf(extension: SorterExtension, groupBy: GroupBy): { key: string; label: string } {
  if (groupBy === 'none') {
    return { key: '', label: '' };
  }
  if (typeof extension.installDateMs !== 'number' || extension.installDateSource === 'unknown') {
    return { key: 'none', label: NO_DATE_GROUP };
  }
  const date = new Date(extension.installDateMs);
  if (groupBy === 'year') {
    return { key: String(date.getFullYear()), label: String(date.getFullYear()) };
  }
  const month = date.getMonth() + 1;
  return {
    key: `${date.getFullYear()}-${String(month).padStart(2, '0')}`,
    label: MONTH_YEAR_FORMAT.format(date),
  };
}

function buildRow(extension: SorterExtension, input: RichListInput): RichListRow {
  const iconUri = input.iconUri?.(extension);
  return {
    id: extension.id,
    name: extension.name,
    subtitle: buildSubtitle(extension),
    dateText: typeof extension.installDateMs === 'number' ? formatInstallDate(extension.installDateMs) : 'Unknown',
    dateSourceLabel: getInstallDateSourceLabel(extension.installDateSource),
    dateIsExact: extension.installDateSource === 'install-recorded' || extension.installDateSource === 'install-observed',
    tooltip: buildPlainTooltip(extension, input.now),
    isTheme: extension.isTheme,
    isBuiltin: extension.isBuiltin,
    ...(iconUri ? { iconUri } : {}),
  };
}

/**
 * Grouping only makes sense for the date orders: with A-Z the "installed in
 * October" group would restart every second row.
 */
export function effectiveGroupBy(sortMode: SortMode, groupBy: GroupBy): GroupBy {
  if (sortMode === 'newest' || sortMode === 'oldest') {
    return groupBy;
  }
  return 'none';
}

export function buildRichListModel(input: RichListInput): RichListModel {
  const groupBy = effectiveGroupBy(input.sortMode, input.groupBy);
  const groups: RichListGroup[] = [];
  let current: RichListGroup | undefined;

  for (const extension of input.visible) {
    const row = buildRow(extension, input);
    const group = groupOf(extension, groupBy);
    if (!current || current.key !== group.key) {
      current = { key: group.key, label: group.label, count: 0, rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
    current.count += 1;
  }

  const model: RichListModel = {
    groups,
    total: input.all.length,
    shown: input.visible.length,
    query: input.query,
    sortLabel: input.sortLabel,
    filterLabel: input.filterLabel,
    isFiltered: input.isFiltered,
    groupBy,
  };
  if (input.visible.length === 0) {
    model.emptyMessage =
      input.all.length === 0
        ? 'No installed extensions to show.'
        : 'No extension matches the current filter and search.';
  }
  return model;
}
