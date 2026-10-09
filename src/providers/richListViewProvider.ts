import * as vscode from 'vscode';
import { SorterExtension } from '../models/extensionInfo';
import { GroupBy, RichListModel, buildRichListModel } from '../models/richList';
import { applyViewOptions } from '../services/sortService';
import { ViewStateService } from '../services/viewStateService';
import { ExtensionTreeProvider, OPEN_DETAILS_COMMAND } from './extensionTreeProvider';
import { renderRichListHtml } from './richListHtml';

/**
 * The "rich" flavour of the list: a webview view that renders what the compact
 * tree cannot.
 *
 * A `TreeItem` is one line of text with a fixed 16px icon (the workbench CSS
 * pins `.monaco-icon-label-iconpath` to `width:16px`), which cannot be changed
 * from an extension. This view is drawn by hand instead, so it can show 32px
 * icons, two lines per row, month headings, hover actions and an in-view search
 * box - the look of the built-in Installed extensions list.
 *
 * It shares everything with the tree view: the same `ExtensionService` (through
 * the tree provider, so the file system is read once), the same `ViewStateService`
 * for sort/filter/search, and the same date formatting. Switching between the
 * two is done with the `extensionSorter.viewStyle` setting.
 */

export const RICH_LIST_VIEW_ID = 'extensionSorter.richList';

const COPY_ID_COMMAND = 'extensionSorter.copyId';
const MARKETPLACE_COMMAND = 'extensionSorter.openInMarketplace';

export interface RichListViewDependencies {
  provider: ExtensionTreeProvider;
  state: ViewStateService;
  log: vscode.LogOutputChannel;
  extensionRoot: vscode.Uri;
  groupBy: () => GroupBy;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

function emptyModel(): RichListModel {
  return {
    groups: [],
    total: 0,
    shown: 0,
    query: '',
    sortLabel: '',
    filterLabel: '',
    isFiltered: false,
    groupBy: 'none',
  };
}

export class RichListViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private model?: RichListModel;
  private resourceRootSignature = '';
  private disposed = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly dependencies: RichListViewDependencies) {
    // Sort/filter/search changed (title bar or the in-view search box) - and
    // every reload of the tree provider - only re-renders this list.
    this.disposables.push(dependencies.state.onDidChange(() => void this.sync()));
    this.disposables.push(dependencies.provider.onDidChangeTreeData(() => void this.sync()));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.applyResourceRoots(view);
    view.webview.html = renderRichListHtml({
      cspSource: view.webview.cspSource,
      nonce: createNonce(),
      initialModel: this.model ?? emptyModel(),
    });
    view.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message), undefined, this.disposables);
    view.onDidDispose(
      () => {
        this.view = undefined;
        this.resourceRootSignature = '';
      },
      undefined,
      this.disposables,
    );
    void this.sync();
  }

  /** Last model that was sent to the webview (also used by the integration tests). */
  getModel(): RichListModel | undefined {
    return this.model;
  }

  getView(): vscode.WebviewView | undefined {
    return this.view;
  }

  /** Rebuilds the model from the shared list and pushes it to the webview. */
  async sync(): Promise<void> {
    if (this.disposed) {
      return;
    }
    try {
      const all = await this.dependencies.provider.getAll();
      const state = this.dependencies.state;
      const visible = applyViewOptions(all, {
        sortMode: state.sortMode,
        filterMode: state.filterMode,
        query: state.query,
      });
      this.model = buildRichListModel({
        all,
        visible,
        query: state.query,
        sortMode: state.sortMode,
        sortLabel: state.describeSort(),
        filterLabel: state.describeFilters(),
        isFiltered: state.isFiltered,
        groupBy: this.dependencies.groupBy(),
        now: Date.now(),
        iconUri: (extension) => this.iconUri(extension),
      });
      if (this.view) {
        this.applyResourceRoots(this.view);
        await this.view.webview.postMessage({ type: 'model', model: this.model });
      }
    } catch (error) {
      this.dependencies.log.error(`Could not build the rich list: ${String(error)}`);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.view = undefined;
  }

  private async handleMessage(message: unknown): Promise<void> {
    const payload = (message ?? {}) as { action?: unknown; id?: unknown; value?: unknown };
    const action = typeof payload.action === 'string' ? payload.action : '';
    const id = typeof payload.id === 'string' ? payload.id : '';
    switch (action) {
      case 'ready':
        await this.sync();
        break;
      case 'search':
        // The query lives in the shared view state, so the tree view, the
        // summary line and the title bar search stay in sync.
        this.dependencies.state.setQuery(typeof payload.value === 'string' ? payload.value : '');
        break;
      case 'reset':
        this.dependencies.state.resetFilters();
        break;
      case 'open':
        await vscode.commands.executeCommand(OPEN_DETAILS_COMMAND, id);
        break;
      case 'copy':
        await vscode.commands.executeCommand(COPY_ID_COMMAND, id);
        break;
      case 'marketplace':
        await vscode.commands.executeCommand(MARKETPLACE_COMMAND, id);
        break;
      default:
        break;
    }
  }

  /**
   * Icons live inside the folders of the extensions themselves, so every
   * extension folder has to be a local resource root. The set only changes when
   * extensions are installed or removed, and `webview.options` can be reassigned.
   */
  private applyResourceRoots(view: vscode.WebviewView): void {
    const roots: vscode.Uri[] = [this.dependencies.extensionRoot];
    for (const extension of vscode.extensions.all) {
      if (extension.extensionUri.scheme === 'file') {
        roots.push(extension.extensionUri);
      }
    }
    const signature = roots.map((root) => root.toString()).join('|');
    if (signature === this.resourceRootSignature) {
      return;
    }
    this.resourceRootSignature = signature;
    view.webview.options = { enableScripts: true, localResourceRoots: roots };
  }

  private iconUri(extension: SorterExtension): string | undefined {
    if (!extension.iconPath || !this.view) {
      return undefined;
    }
    try {
      return this.view.webview.asWebviewUri(vscode.Uri.file(extension.iconPath)).toString();
    } catch (error) {
      this.dependencies.log.warn(`Could not resolve the icon of ${extension.id}: ${String(error)}`);
      return undefined;
    }
  }
}
