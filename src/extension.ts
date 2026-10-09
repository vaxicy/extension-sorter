import * as vscode from 'vscode';
import { registerExtensionCommands } from './commands/extensionCommands';
import { registerViewCommands } from './commands/sortCommands';
import { SorterExtension } from './models/extensionInfo';
import { ExtensionTreeProvider, VIEW_ID } from './providers/extensionTreeProvider';
import { CONFIGURATION_SECTION, ExtensionService } from './services/extensionService';
import { InstallDateService, OBSERVED_INSTALL_WINDOW_MS } from './services/installDateService';
import { InstallHistoryService } from './services/installHistoryService';
import { ViewStateService } from './services/viewStateService';

/**
 * Extension Sorter.
 *
 * The extension activates on `onStartupFinished` for one reason only: to be
 * able to *observe* installs. Everything else is lazy - the installed
 * extensions are read when the `Installed by Date` view is expanded for the
 * first time, and refreshed afterwards by the official change event.
 */

/** Multiple change events within this window are merged into one refresh. */
const CHANGE_DEBOUNCE_MS = 400;

/**
 * Handles returned by `activate()`.
 *
 * The extension itself does not need them, but they let the integration tests
 * (which run inside a real extension host) inspect the very objects the view
 * uses instead of re-implementing them.
 */
export interface ExtensionSorterApi {
  readonly context: vscode.ExtensionContext;
  readonly log: vscode.LogOutputChannel;
  readonly provider: ExtensionTreeProvider;
  readonly treeView: vscode.TreeView<SorterExtension>;
  readonly service: ExtensionService;
  readonly dates: InstallDateService;
  readonly history: InstallHistoryService;
  readonly state: ViewStateService;
}

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionSorterApi> {
  const log = vscode.window.createOutputChannel('Extension Sorter', { log: true });
  context.subscriptions.push(log);
  log.info(`Extension Sorter is starting on VS Code ${vscode.version}.`);

  const dateService = new InstallDateService();
  const historyService = new InstallHistoryService(context.globalState);
  historyService.load();
  const extensionService = new ExtensionService(dateService, historyService, log);

  const viewState = new ViewStateService(context.globalState);
  viewState.load(extensionService.defaultSortMode());

  const provider = new ExtensionTreeProvider({ service: extensionService, state: viewState, log });
  context.subscriptions.push(provider);

  const treeView = vscode.window.createTreeView<SorterExtension>(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  const updateViewChrome = (): void => {
    const snapshot = provider.getSnapshot();
    if (snapshot.total === 0) {
      treeView.description = undefined;
    } else if (snapshot.isFiltered) {
      treeView.description = `${snapshot.visible} of ${snapshot.total} · ${snapshot.sortLabel}`;
    } else {
      treeView.description = `${snapshot.total} extension${snapshot.total === 1 ? '' : 's'} · ${snapshot.sortLabel}`;
    }
    treeView.message = snapshot.isFiltered
      ? `Showing ${snapshot.visible} of ${snapshot.total} extensions (${snapshot.filterLabel}). Run "Extension Sorter: Reset Filters and Search" to show everything.`
      : undefined;
  };
  context.subscriptions.push(provider.onDidChangeTreeData(updateViewChrome));

  registerViewCommands(context, { provider, state: viewState, treeView, log });
  registerExtensionCommands(context, { log });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIGURATION_SECTION)) {
        log.info('Configuration changed, refreshing the extension list.');
        void provider.refresh(true);
      }
    }),
  );

  // ---- install observation ------------------------------------------------
  // `knownIds` is the set of extensions we already saw at least once. New ids
  // appearing while we are running mean "installed just now" - but only a
  // matching folder timestamp proves it; otherwise the id is merely recorded as
  // first seen. Installs that happened while VS Code was closed can never be
  // dated precisely, and are reported as an estimate.
  let knownIds = new Set<string>();
  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  const syncHistory = async (observeInstalls: boolean): Promise<void> => {
    const snapshot = extensionService.snapshot();
    const currentIds = new Set(snapshot.map((entry) => entry.id));
    const appeared = [...currentIds].filter((id) => !knownIds.has(id));

    let observedInstallIds: Set<string> | undefined;
    if (observeInstalls && appeared.length > 0) {
      observedInstallIds = new Set<string>();
      const now = Date.now();
      for (const id of appeared) {
        const extension = vscode.extensions.all.find((candidate) => candidate.id.toLowerCase() === id);
        if (!extension || extension.extensionUri.scheme !== 'file') {
          continue;
        }
        const times = await dateService.readFileTimes(extension.extensionUri.fsPath);
        if (times && Math.abs(times.birthtimeMs - now) <= OBSERVED_INSTALL_WINDOW_MS) {
          observedInstallIds.add(id);
        }
      }
      log.info(
        `Extensions appeared while Extension Sorter was running: ${appeared.join(', ')}` +
          ` (confirmed installs: ${observedInstallIds.size}).`,
      );
    }

    await historyService.record(snapshot, {
      initialScan: !observeInstalls,
      observedInstallIds,
      retentionDays: extensionService.retentionDays(),
    });
    knownIds = currentIds;
  };

  // The first scan of a session never claims to know when something was
  // installed: everything found here may have been installed while VS Code was
  // closed, so extensions new to us are only recorded as "first seen".
  await syncHistory(false);

  const scheduleSync = (): void => {
    if (syncTimer) {
      clearTimeout(syncTimer);
    }
    syncTimer = setTimeout(() => {
      syncTimer = undefined;
      void (async () => {
        try {
          await syncHistory(true);
        } catch (error) {
          log.error(`Could not update the install history: ${String(error)}`);
        }
        await provider.refresh(true);
      })();
    }, CHANGE_DEBOUNCE_MS);
  };

  context.subscriptions.push(vscode.extensions.onDidChange(scheduleSync));
  context.subscriptions.push({
    dispose: () => {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = undefined;
      }
    },
  });

  log.info(`Extension Sorter is ready (${extensionService.snapshot().length} installed extensions visible to this window).`);

  return {
    context,
    log,
    provider,
    treeView,
    service: extensionService,
    dates: dateService,
    history: historyService,
    state: viewState,
  };
}

export function deactivate(): void {
  // Nothing to clean up beyond `context.subscriptions`.
}
