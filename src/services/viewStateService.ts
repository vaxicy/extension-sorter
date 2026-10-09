import { MementoLike } from './installHistoryService';
import {
  DEFAULT_SORT_MODE,
  FILTER_MODE_INFO,
  FilterMode,
  SORT_MODE_INFO,
  SortMode,
  isSortMode,
} from './sortService';

/**
 * Holds what the user currently looks at: sort order, filter and search query.
 *
 * Only the sort order is persisted (in `globalState`, so it survives a
 * restart); the filter and the search term are intentionally session only - a
 * forgotten filter that hides extensions is worse than having to retype it.
 */

export const SORT_MODE_STORAGE_KEY = 'extensionSorter.sortMode';

export class ViewStateService {
  private sortModeValue: SortMode = DEFAULT_SORT_MODE;
  private filterModeValue: FilterMode = 'all';
  private queryValue = '';
  private readonly listeners = new Set<() => void>();

  constructor(private readonly memento: MementoLike) {}

  /** Restores the persisted sort order; `fallback` comes from the settings. */
  load(fallback: SortMode = DEFAULT_SORT_MODE): SortMode {
    const stored = this.memento.get<unknown>(SORT_MODE_STORAGE_KEY, undefined);
    this.sortModeValue = isSortMode(stored) ? stored : fallback;
    return this.sortModeValue;
  }

  get sortMode(): SortMode {
    return this.sortModeValue;
  }

  get filterMode(): FilterMode {
    return this.filterModeValue;
  }

  get query(): string {
    return this.queryValue;
  }

  /** `true` when the list shown differs from "all installed extensions". */
  get isFiltered(): boolean {
    return this.filterModeValue !== 'all' || this.queryValue.length > 0;
  }

  async setSortMode(mode: SortMode): Promise<void> {
    if (this.sortModeValue === mode) {
      return;
    }
    this.sortModeValue = mode;
    await this.memento.update(SORT_MODE_STORAGE_KEY, mode);
    this.fire();
  }

  setFilterMode(mode: FilterMode): void {
    if (this.filterModeValue === mode) {
      return;
    }
    this.filterModeValue = mode;
    this.fire();
  }

  setQuery(query: string): void {
    if (this.queryValue === query) {
      return;
    }
    this.queryValue = query;
    this.fire();
  }

  resetFilters(): void {
    if (!this.isFiltered) {
      return;
    }
    this.filterModeValue = 'all';
    this.queryValue = '';
    this.fire();
  }

  /** Human readable summary such as `Theme extensions only - "lilac"`. */
  describeFilters(): string {
    const parts: string[] = [];
    if (this.filterModeValue !== 'all') {
      parts.push(`${FILTER_MODE_INFO[this.filterModeValue].label.toLowerCase()}`);
    }
    if (this.queryValue.length > 0) {
      parts.push(`search "${this.queryValue}"`);
    }
    return parts.join(' + ');
  }

  describeSort(): string {
    return SORT_MODE_INFO[this.sortModeValue].shortLabel;
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private fire(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
