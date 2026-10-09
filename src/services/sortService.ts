import { SorterExtension, hasUsableInstallDate } from '../models/extensionInfo';

/**
 * Sorting, filtering and searching of the extension list.
 * Pure functions only - the tree view is a thin wrapper around this module.
 */

export type SortMode = 'newest' | 'oldest' | 'nameAsc' | 'nameDesc';
export type FilterMode = 'all' | 'themes' | 'nonThemes';

export const DEFAULT_SORT_MODE: SortMode = 'newest';
export const SORT_MODES: readonly SortMode[] = ['newest', 'oldest', 'nameAsc', 'nameDesc'];
export const FILTER_MODES: readonly FilterMode[] = ['all', 'themes', 'nonThemes'];

export interface SortModeInfo {
  label: string;
  /** Short form used in the view description (next to the title). */
  shortLabel: string;
  description: string;
}

export const SORT_MODE_INFO: Readonly<Record<SortMode, SortModeInfo>> = {
  newest: {
    label: 'Newest Installed First',
    shortLabel: 'Newest first',
    description: 'Recently installed extensions on top. Extensions without a date go last.',
  },
  oldest: {
    label: 'Oldest Installed First',
    shortLabel: 'Oldest first',
    description: 'Oldest installations on top. Extensions without a date go last.',
  },
  nameAsc: {
    label: 'Name A-Z',
    shortLabel: 'Name A-Z',
    description: 'Alphabetical by extension name.',
  },
  nameDesc: {
    label: 'Name Z-A',
    shortLabel: 'Name Z-A',
    description: 'Reverse alphabetical by extension name.',
  },
};

export const FILTER_MODE_INFO: Readonly<Record<FilterMode, { label: string; description: string }>> = {
  all: { label: 'All Extensions', description: 'Every installed extension.' },
  themes: { label: 'Themes Only', description: 'Extensions that contribute color, icon or product icon themes.' },
  nonThemes: { label: 'Non-Theme Extensions', description: 'Everything except theme extensions.' },
};

export function isSortMode(value: unknown): value is SortMode {
  return typeof value === 'string' && (SORT_MODES as readonly string[]).includes(value);
}

export function isFilterMode(value: unknown): value is FilterMode {
  return typeof value === 'string' && (FILTER_MODES as readonly string[]).includes(value);
}

/**
 * Name comparison used for the A-Z / Z-A modes and as the stable secondary
 * criterion of the date modes. The id breaks ties so the order never depends on
 * the order in which VS Code happened to hand out the extensions.
 */
export function compareByName(a: SorterExtension, b: SorterExtension, descending = false): number {
  const delta = a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
  if (delta !== 0) {
    return descending ? -delta : delta;
  }
  return a.id.localeCompare(b.id, 'en');
}

/** Date comparison; unknown dates always sort to the end, never to the top. */
export function compareByInstallDate(a: SorterExtension, b: SorterExtension, newestFirst: boolean): number {
  const aKnown = hasUsableInstallDate(a);
  const bKnown = hasUsableInstallDate(b);
  if (aKnown && bKnown) {
    const delta = (a.installDateMs as number) - (b.installDateMs as number);
    if (delta !== 0) {
      return newestFirst ? -delta : delta;
    }
    return compareByName(a, b);
  }
  if (aKnown) {
    return -1;
  }
  if (bKnown) {
    return 1;
  }
  return compareByName(a, b);
}

/** Returns a new array; the input is never mutated. */
export function sortExtensions(list: readonly SorterExtension[], mode: SortMode): SorterExtension[] {
  const sorted = [...list];
  switch (mode) {
    case 'newest':
      sorted.sort((a, b) => compareByInstallDate(a, b, true));
      break;
    case 'oldest':
      sorted.sort((a, b) => compareByInstallDate(a, b, false));
      break;
    case 'nameAsc':
      sorted.sort((a, b) => compareByName(a, b, false));
      break;
    case 'nameDesc':
      sorted.sort((a, b) => compareByName(a, b, true));
      break;
  }
  return sorted;
}

/**
 * Case insensitive search over display name, publisher and extension id.
 * Multiple words must all match (in any of the three fields).
 */
export function matchesQuery(extension: SorterExtension, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = `${extension.name}\n${extension.publisher}\n${extension.id}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterExtensions(
  list: readonly SorterExtension[],
  filter: FilterMode,
  query = '',
): SorterExtension[] {
  const trimmed = query.trim();
  return list.filter((extension) => {
    if (filter === 'themes' && !extension.isTheme) {
      return false;
    }
    if (filter === 'nonThemes' && extension.isTheme) {
      return false;
    }
    return matchesQuery(extension, trimmed);
  });
}

export interface ViewOptions {
  sortMode: SortMode;
  filterMode: FilterMode;
  query: string;
}

/** The single entry point used by the tree provider: filter first, then sort. */
export function applyViewOptions(list: readonly SorterExtension[], options: ViewOptions): SorterExtension[] {
  return sortExtensions(filterExtensions(list, options.filterMode, options.query), options.sortMode);
}

export interface FilterCounts {
  /** Total number of extensions in the view (before filtering). */
  total: number;
  all: number;
  themes: number;
  nonThemes: number;
}

/** Counts for the filter quick pick; the query is taken into account. */
export function countByFilter(list: readonly SorterExtension[], query = ''): FilterCounts {
  return {
    total: list.length,
    all: filterExtensions(list, 'all', query).length,
    themes: filterExtensions(list, 'themes', query).length,
    nonThemes: filterExtensions(list, 'nonThemes', query).length,
  };
}
