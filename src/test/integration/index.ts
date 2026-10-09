import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import Mocha = require('mocha');

/**
 * Entry point used by `--extensionTestsPath`.
 *
 * VS Code runs this inside a real extension host (`ExtensionMode.Test`), which
 * is the only way to verify the parts of the extension that talk to the editor:
 * contributed commands, `extension.open`, `globalState` and the tree data
 * provider.
 */
export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 120_000, reporter: 'spec' });
  const testsRoot = __dirname;

  for (const file of fs.readdirSync(testsRoot)) {
    if (file.endsWith('.test.js')) {
      mocha.addFile(path.join(testsRoot, file));
    }
  }

  return new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      // Report the result to the CLI first, then shut the editor down gracefully
      // instead of letting the harness kill it.
      setTimeout(() => {
        void vscode.commands.executeCommand('workbench.action.quit').then(undefined, () => undefined);
      }, 3_000);

      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
