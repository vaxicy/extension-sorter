import * as vscode from 'vscode';

/**
 * Opening the *native* extension details page.
 *
 * `extension.open` is the command the built-in Extensions view uses to open the
 * details editor (README, screenshots, Changelog, Set Color Theme, Disable,
 * Uninstall, ...). It is not part of the public extension API, so it is treated
 * as "best effort":
 *
 *   1. the command is looked up in the list of registered commands,
 *   2. it is executed with the full extension id,
 *   3. if that is not possible - or a future VS Code build removes it - the
 *      built-in Extensions view is opened filtered by `@id:<id>` instead and the
 *      user is offered the Marketplace page.
 *
 * VS Code is never modified in any way, and no page is opened in a browser
 * unless the user explicitly asks for it.
 */

const EXTENSION_OPEN_COMMAND = 'extension.open';
const EXTENSIONS_SEARCH_COMMAND = 'workbench.extensions.search';

export interface ExtensionCommandDependencies {
  log: vscode.LogOutputChannel;
}

let registeredCommands: Promise<Set<string>> | undefined;
let extensionOpenAvailable: boolean | undefined;

async function getRegisteredCommands(): Promise<Set<string>> {
  if (!registeredCommands) {
    const commands = await vscode.commands.getCommands(true);
    registeredCommands = Promise.resolve(new Set(commands));
  }
  return registeredCommands;
}

/** `true` when this VS Code build exposes the native details command. */
export async function isExtensionOpenAvailable(dependencies: ExtensionCommandDependencies): Promise<boolean> {
  if (extensionOpenAvailable === undefined) {
    const commands = await getRegisteredCommands();
    extensionOpenAvailable = commands.has(EXTENSION_OPEN_COMMAND);
    if (extensionOpenAvailable) {
      dependencies.log.info(`Using the built-in command "${EXTENSION_OPEN_COMMAND}" to open extension details.`);
    } else {
      dependencies.log.warn(
        `The built-in command "${EXTENSION_OPEN_COMMAND}" is not registered in this VS Code build. ` +
          'Extension Sorter will fall back to filtering the built-in Extensions view.',
      );
    }
  }
  return extensionOpenAvailable;
}

export function forgetCommandAvailability(): void {
  registeredCommands = undefined;
  extensionOpenAvailable = undefined;
}

/**
 * Opens the native details editor for `extensionId`.
 * Never throws: a failure ends in a warning message with alternatives.
 */
export async function openExtensionDetails(extensionId: string, dependencies: ExtensionCommandDependencies): Promise<void> {
  const id = extensionId.trim().toLowerCase();
  if (!id) {
    return;
  }

  if (await isExtensionOpenAvailable(dependencies)) {
    try {
      await vscode.commands.executeCommand(EXTENSION_OPEN_COMMAND, id);
      dependencies.log.info(`Opened the native details page of ${id}.`);
      return;
    } catch (error) {
      dependencies.log.warn(`"${EXTENSION_OPEN_COMMAND}" failed for ${id}: ${String(error)}`);
    }
  }

  // Fallback: show the extension inside the built-in Extensions view instead.
  try {
    await vscode.commands.executeCommand(EXTENSIONS_SEARCH_COMMAND, `@id:${id}`);
  } catch (error) {
    dependencies.log.warn(`Could not open the Extensions view: ${String(error)}`);
  }

  // Deliberately not awaited: the command is done once the Extensions view is
  // open, and the notification must not keep it "running".
  void vscode.window
    .showWarningMessage(
      `Extension Sorter could not open the native details page of "${id}" in this VS Code build.`,
      'Open in Marketplace',
      'Copy Extension ID',
    )
    .then((choice) => {
      if (choice === 'Open in Marketplace') {
        return openInMarketplace(id, dependencies);
      }
      if (choice === 'Copy Extension ID') {
        return vscode.env.clipboard.writeText(id);
      }
      return undefined;
    });
}

export async function openInMarketplace(extensionId: string, dependencies: ExtensionCommandDependencies): Promise<void> {
  const id = extensionId.trim().toLowerCase();
  if (!id) {
    return;
  }
  const uri = vscode.Uri.parse(`https://marketplace.visualstudio.com/items?itemName=${encodeURIComponent(id)}`);
  dependencies.log.info(`Opening ${uri.toString()} in the browser.`);
  await vscode.env.openExternal(uri);
}

export async function copyExtensionId(extensionId: string, dependencies: ExtensionCommandDependencies): Promise<void> {
  const id = extensionId.trim().toLowerCase();
  if (!id) {
    return;
  }
  await vscode.env.clipboard.writeText(id);
  dependencies.log.info(`Copied ${id} to the clipboard.`);
  vscode.window.setStatusBarMessage(`Copied ${id}`, 3000);
}

export function registerExtensionCommands(context: vscode.ExtensionContext, dependencies: ExtensionCommandDependencies): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('extensionSorter.openDetails', (extensionId: string) =>
      openExtensionDetails(String(extensionId ?? ''), dependencies),
    ),
    vscode.commands.registerCommand('extensionSorter.copyId', (extensionId: string) =>
      copyExtensionId(String(extensionId ?? ''), dependencies),
    ),
    vscode.commands.registerCommand('extensionSorter.openInMarketplace', (extensionId: string) =>
      openInMarketplace(String(extensionId ?? ''), dependencies),
    ),
  );
}
