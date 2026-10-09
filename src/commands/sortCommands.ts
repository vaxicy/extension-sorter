import * as vscode from 'vscode';
import { ExtensionTreeProvider, VIEW_ID } from '../providers/extensionTreeProvider';
import { SorterExtension } from '../models/extensionInfo';
import { FILTER_MODE_INFO, FILTER_MODES, FilterMode, SORT_MODE_INFO, SORT_MODES, SortMode } from '../services/sortService';
import { ViewStateService } from '../services/viewStateService';

/**
 * The commands behind the view title bar and the command palette:
 * sort, filter, search, refresh and reset.
 */

export interface ViewCommandDependencies {
  provider: ExtensionTreeProvider;
  state: ViewStateService;
  treeView: vscode.TreeView<SorterExtension>;
  log: vscode.LogOutputChannel;
}

/** Brings the view into the foreground when a command was triggered from the palette. */
async function revealView(dependencies: ViewCommandDependencies): Promise<void> {
  if (dependencies.treeView.visible) {
    return;
  }
  try {
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  } catch {
    // Focusing is a convenience only; ignore failures on older VS Code builds.
  }
}

async function pickSortMode(dependencies: ViewCommandDependencies): Promise<void> {
  const current = dependencies.state.sortMode;
  const items = SORT_MODES.map((mode) => ({
    label: SORT_MODE_INFO[mode].label,
    description: mode === current ? 'Current' : undefined,
    detail: SORT_MODE_INFO[mode].description,
    picked: mode === current,
    mode,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Sort Installed Extensions By',
    placeHolder: 'Choose the order of the "Installed by Date" view',
    ignoreFocusOut: true,
  });
  if (!picked) {
    return;
  }
  await dependencies.state.setSortMode(picked.mode as SortMode);
  dependencies.log.info(`Sort order changed to "${SORT_MODE_INFO[picked.mode as SortMode].label}".`);
  await revealView(dependencies);
}

async function pickFilterMode(dependencies: ViewCommandDependencies): Promise<void> {
  const counts = dependencies.provider.counts();
  const current = dependencies.state.filterMode;
  const items = FILTER_MODES.map((mode) => ({
    label: FILTER_MODE_INFO[mode].label,
    description: `${counts[mode as FilterMode]}`,
    detail: FILTER_MODE_INFO[mode].description,
    picked: mode === current,
    mode,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Filter Installed Extensions',
    placeHolder: 'Show all extensions, only themes, or everything that is not a theme',
    ignoreFocusOut: true,
  });
  if (!picked) {
    return;
  }
  dependencies.state.setFilterMode(picked.mode as FilterMode);
  dependencies.log.info(`Filter changed to "${FILTER_MODE_INFO[picked.mode as FilterMode].label}".`);
  await revealView(dependencies);
}

async function searchExtensions(dependencies: ViewCommandDependencies): Promise<void> {
  const query = await vscode.window.showInputBox({
    title: 'Search Installed Extensions',
    prompt: 'Matches the extension name, the publisher and the extension id. Multiple words must all match.',
    placeHolder: 'e.g. theme, dracula, lilinhuang',
    value: dependencies.state.query,
    ignoreFocusOut: true,
  });
  if (query === undefined) {
    return; // cancelled: keep the current search
  }
  dependencies.state.setQuery(query.trim());
  await revealView(dependencies);
}

async function refreshExtensions(dependencies: ViewCommandDependencies): Promise<void> {
  dependencies.log.info('Refreshing the installed extension list.');
  await dependencies.provider.refresh(true);
}

async function resetFilters(dependencies: ViewCommandDependencies): Promise<void> {
  dependencies.state.resetFilters();
  await revealView(dependencies);
}

export function registerViewCommands(context: vscode.ExtensionContext, dependencies: ViewCommandDependencies): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('extensionSorter.sort', () => pickSortMode(dependencies)),
    vscode.commands.registerCommand('extensionSorter.filter', () => pickFilterMode(dependencies)),
    vscode.commands.registerCommand('extensionSorter.search', () => searchExtensions(dependencies)),
    vscode.commands.registerCommand('extensionSorter.refresh', () => refreshExtensions(dependencies)),
    vscode.commands.registerCommand('extensionSorter.clearFilters', () => resetFilters(dependencies)),
  );
}
