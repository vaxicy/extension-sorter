import * as vscode from 'vscode';
import { formatInstallDate, getInstallDateSourceLabel } from '../models/dateFormat';
import { SorterExtension } from '../models/extensionInfo';
import { buildTooltipLines } from '../models/tooltip';
import { ExtensionService } from '../services/extensionService';
import { FilterCounts, applyViewOptions, countByFilter } from '../services/sortService';
import { ViewStateService } from '../services/viewStateService';

/** Id of the view contributed by this extension. */
export const VIEW_ID = 'extensionSorter.installedByDate';

/** Command that opens the native extension details editor. */
export const OPEN_DETAILS_COMMAND = 'extensionSorter.openDetails';

export interface ViewSnapshot {
  total: number;
  visible: number;
  isFiltered: boolean;
  sortLabel: string;
  filterLabel: string;
}

export interface TreeProviderDependencies {
  service: ExtensionService;
  state: ViewStateService;
  log: vscode.LogOutputChannel;
}

/**
 * Flat tree of installed extensions.
 *
 * The provider only knows how to read the list and how to render one row; the
 * ordering rules live in `sortService` and the date rules in
 * `installDateService`. Loading is lazy: nothing touches the file system until
 * the view is actually expanded for the first time.
 */
export class ExtensionTreeProvider implements vscode.TreeDataProvider<SorterExtension> {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly stateSubscription: { dispose(): void };
  private readonly service: ExtensionService;
  private readonly state: ViewStateService;
  private readonly log: vscode.LogOutputChannel;

  private all: SorterExtension[] = [];
  private visible: SorterExtension[] = [];
  private loaded = false;
  private generation = 0;
  private loading: Promise<void> | undefined;

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(dependencies: TreeProviderDependencies) {
    this.service = dependencies.service;
    this.state = dependencies.state;
    this.log = dependencies.log;
    // Changing sort order, filter or search term only re-renders, it does not
    // re-read the disk.
    this.stateSubscription = this.state.onDidChange(() => {
      this.applyViewOptions();
      this.emitter.fire();
    });
  }

  dispose(): void {
    this.stateSubscription.dispose();
    this.emitter.dispose();
  }

  getSnapshot(): ViewSnapshot {
    return {
      total: this.all.length,
      visible: this.visible.length,
      isFiltered: this.state.isFiltered,
      sortLabel: this.state.describeSort(),
      filterLabel: this.state.describeFilters(),
    };
  }

  counts(): FilterCounts {
    return countByFilter(this.all, this.state.query);
  }

  /** `hard` also forgets cached file system dates (manual refresh, config change). */
  async refresh(hard = false): Promise<void> {
    await this.reload(hard);
  }

  /**
   * Everything the service reads, unfiltered and unsorted.
   *
   * The rich list view borrows this so the file system is read exactly once,
   * no matter which of the two views is visible.
   */
  async getAll(): Promise<SorterExtension[]> {
    if (!this.loaded) {
      await this.reload(true);
    }
    return this.all;
  }

  async getChildren(element?: SorterExtension): Promise<SorterExtension[]> {
    if (element) {
      return []; // flat list, no nesting
    }
    if (!this.loaded) {
      await this.reload(true);
    }
    return this.visible;
  }

  getTreeItem(extension: SorterExtension): vscode.TreeItem {
    const item = new vscode.TreeItem(extension.name, vscode.TreeItemCollapsibleState.None);
    item.id = extension.id;
    item.description = this.buildDescription(extension);
    item.tooltip = new vscode.MarkdownString(buildTooltipLines(extension, { now: Date.now() }).join('\n\n'));
    item.contextValue = this.buildContextValue(extension);
    item.iconPath = this.buildIcon(extension);
    item.accessibilityInformation = {
      label: `${extension.name}, ${extension.publisher}, ${formatInstallDate(extension.installDateMs)}, ${getInstallDateSourceLabel(extension.installDateSource)}`,
    };
    item.command = {
      command: OPEN_DETAILS_COMMAND,
      title: 'Open Extension Details',
      arguments: [extension.id],
    };
    return item;
  }

  /** `publisher · Oct 9, 2026 · Estimated` - the format used by the view. */
  private buildDescription(extension: SorterExtension): string {
    const parts = [extension.publisher, formatInstallDate(extension.installDateMs), getInstallDateSourceLabel(extension.installDateSource)];
    if (extension.isBuiltin) {
      parts.push('Built-in');
    }
    return parts.join(' · ');
  }

  private buildContextValue(extension: SorterExtension): string {
    if (extension.isBuiltin) {
      return 'extensionSorter.builtin';
    }
    return extension.isTheme ? 'extensionSorter.theme' : 'extensionSorter.extension';
  }

  private buildIcon(extension: SorterExtension): vscode.ThemeIcon | vscode.Uri {
    if (extension.iconPath) {
      return vscode.Uri.file(extension.iconPath);
    }
    return new vscode.ThemeIcon(extension.isTheme ? 'symbol-color' : 'extensions');
  }

  private async reload(hard: boolean): Promise<void> {
    const generation = ++this.generation;
    if (!hard && this.loaded) {
      this.applyViewOptions();
      this.emitter.fire();
      return;
    }
    if (hard) {
      this.service.invalidateCaches();
    }
    this.loading = (async () => {
      try {
        const items = await this.service.readExtensions();
        if (generation !== this.generation) {
          return; // a newer reload won
        }
        this.all = items;
        this.applyViewOptions();
        this.loaded = true;
      } catch (error) {
        this.log.error(`Could not read the installed extensions: ${String(error)}`);
      } finally {
        if (generation === this.generation) {
          this.emitter.fire();
        }
      }
    })();
    await this.loading;
  }

  private applyViewOptions(): void {
    this.visible = applyViewOptions(this.all, {
      sortMode: this.state.sortMode,
      filterMode: this.state.filterMode,
      query: this.state.query,
    });
  }
}
