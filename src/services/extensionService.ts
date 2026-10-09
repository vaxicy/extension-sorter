import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { SorterExtension } from '../models/extensionInfo';
import { DEFAULT_GROUP_BY, GroupBy, isGroupBy } from '../models/richList';
import {
  asRecord,
  getColorThemeCount,
  getDescription,
  getDisplayName,
  getManifestIcon,
  getPublisher,
  getVersion,
  isPathInside,
  isThemeExtension,
} from '../models/extensionManifest';
import { mapWithConcurrency } from '../util/async';
import { DEFAULT_RETENTION_DAYS, ExtensionSnapshotEntry, InstallHistoryService, normalizeId } from './installHistoryService';
import { InstallDateService } from './installDateService';
import { DEFAULT_SORT_MODE, SortMode, isSortMode } from './sortService';

export const CONFIGURATION_SECTION = 'extensionSorter';

/** How the `Installed by Date` view is drawn. */
export type ViewStyle = 'rich' | 'compact';
export const VIEW_STYLES: readonly ViewStyle[] = ['rich', 'compact'];
export const DEFAULT_VIEW_STYLE: ViewStyle = 'rich';

export function isViewStyle(value: unknown): value is ViewStyle {
  return typeof value === 'string' && (VIEW_STYLES as readonly string[]).includes(value);
}

/** How many extension folders are inspected at the same time. */
const IO_CONCURRENCY = 12;

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Path based built-in detection: built-ins live in `<appRoot>/extensions`. */
export function isBuiltinExtensionPath(extensionPath: string, builtInRoot: string): boolean {
  if (!extensionPath || !builtInRoot) {
    return false;
  }
  return isPathInside(builtInRoot, extensionPath, process.platform === 'win32');
}

/**
 * Reads the installed extensions through `vscode.extensions.all` and turns them
 * into view rows. Every file system access is guarded: one unreadable extension
 * (remote host, permission problem, deleted folder) must never break the list.
 */
export class ExtensionService {
  constructor(
    private readonly dates: InstallDateService,
    private readonly history: InstallHistoryService,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  private get configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
  }

  includeBuiltInExtensions(): boolean {
    return this.configuration.get<boolean>('includeBuiltInExtensions', false) === true;
  }

  retentionDays(): number {
    const value = this.configuration.get<number>('installHistoryRetentionDays', DEFAULT_RETENTION_DAYS);
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : DEFAULT_RETENTION_DAYS;
  }

  /** Sort order used when the user has not chosen one yet. */
  defaultSortMode(): SortMode {
    const value = this.configuration.get<string>('defaultSortOrder', DEFAULT_SORT_MODE);
    return isSortMode(value) ? value : DEFAULT_SORT_MODE;
  }

  /** Look of the `Installed by Date` view: the hand drawn list or the tree. */
  viewStyle(): ViewStyle {
    const value = this.configuration.get<string>('viewStyle', DEFAULT_VIEW_STYLE);
    return isViewStyle(value) ? value : DEFAULT_VIEW_STYLE;
  }

  /** Grouping of the rich list (ignored by the name sort orders). */
  groupBy(): GroupBy {
    const value = this.configuration.get<string>('groupBy', DEFAULT_GROUP_BY);
    return isGroupBy(value) ? value : DEFAULT_GROUP_BY;
  }

  /** `<appRoot>/extensions`, or '' when VS Code does not tell us where it lives. */
  get builtInRoot(): string {
    const appRoot = vscode.env.appRoot;
    return appRoot ? path.join(appRoot, 'extensions') : '';
  }

  /** Ids + versions of everything currently installed. No file system access. */
  snapshot(): ExtensionSnapshotEntry[] {
    return vscode.extensions.all.map((extension) => ({
      id: normalizeId(extension.id),
      version: getVersion(extension.packageJSON),
    }));
  }

  /** Drops cached file system dates so the next read hits the disk again. */
  invalidateCaches(): void {
    this.dates.clearCache();
  }

  async readExtensions(): Promise<SorterExtension[]> {
    const includeBuiltIn = this.includeBuiltInExtensions();
    const builtInRoot = this.builtInRoot;
    const now = Date.now();
    const all = vscode.extensions.all;

    const rows = await mapWithConcurrency(all, IO_CONCURRENCY, async (extension) => {
      try {
        return await this.readExtension(extension, { includeBuiltIn, builtInRoot, now });
      } catch (error) {
        this.log.warn(`Could not read extension ${extension.id}: ${String(error)}`);
        return undefined;
      }
    });

    const result = rows.filter((row): row is SorterExtension => row !== undefined);
    this.log.info(
      `Read ${result.length} of ${all.length} extensions` +
        `${includeBuiltIn ? ' (built-in extensions included)' : ' (built-in extensions hidden)'}.`,
    );
    return result;
  }

  private async readExtension(
    extension: vscode.Extension<unknown>,
    context: { includeBuiltIn: boolean; builtInRoot: string; now: number },
  ): Promise<SorterExtension | undefined> {
    const manifest = asRecord(extension.packageJSON);
    const id = normalizeId(extension.id);
    const fileSystemReadable = extension.extensionUri.scheme === 'file' && extension.extensionUri.fsPath.length > 0;
    const extensionPath = fileSystemReadable ? extension.extensionUri.fsPath : '';
    const isBuiltin = this.detectBuiltIn(extensionPath, context.builtInRoot, getPublisher(manifest, id));

    if (isBuiltin && !context.includeBuiltIn) {
      return undefined;
    }

    const date = await this.dates.resolveFor({ extensionPath, packageJSON: manifest, fileSystemReadable }, this.history.get(id), context.now);

    const row: SorterExtension = {
      id,
      name: getDisplayName(manifest, id),
      publisher: getPublisher(manifest, id),
      version: getVersion(manifest),
      description: getDescription(manifest),
      isTheme: isThemeExtension(manifest),
      themeCount: getColorThemeCount(manifest),
      isBuiltin,
      extensionPath,
      installDateSource: date.source,
    };
    if (typeof date.ms === 'number') {
      row.installDateMs = date.ms;
    }

    const iconPath = await this.resolveIconPath(extensionPath, manifest);
    if (iconPath) {
      row.iconPath = iconPath;
    }
    return row;
  }

  /**
   * Built-ins are detected by location. Only when the extension has no readable
   * file system path do we fall back to the reserved `vscode` publisher.
   */
  private detectBuiltIn(extensionPath: string, builtInRoot: string, publisher: string): boolean {
    if (extensionPath && builtInRoot) {
      return isBuiltinExtensionPath(extensionPath, builtInRoot);
    }
    return publisher === 'vscode';
  }

  /** Resolves the manifest `icon` to an existing file that stays inside the extension folder. */
  private async resolveIconPath(extensionPath: string, manifest: Record<string, unknown> | undefined): Promise<string | undefined> {
    const relative = getManifestIcon(manifest);
    if (!extensionPath || !relative) {
      return undefined;
    }
    const candidate = path.resolve(extensionPath, relative);
    if (!isPathInside(extensionPath, candidate, process.platform === 'win32')) {
      this.log.warn(`Ignoring icon outside of the extension folder: ${relative}.`);
      return undefined;
    }
    return (await fileExists(candidate)) ? candidate : undefined;
  }
}
