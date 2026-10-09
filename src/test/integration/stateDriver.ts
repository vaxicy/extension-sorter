import * as fs from 'fs';
import * as vscode from 'vscode';
import { ExtensionSorterApi } from '../../extension';
import { ViewStateService } from '../../services/viewStateService';

/**
 * Editor side of the cross-restart persistence check.
 *
 * VS Code switches **every** storage database to in-memory SQLite (`:memory:`) as
 * soon as `--extensionTestsPath` is on the command line - that is the flag that
 * makes the editor run extension tests:
 *
 *     // out/mainImpl.js, StorageMainService
 *     getStorageOptions() { return { useInMemoryStorage: !!this.environmentService.extensionTestsLocationURI }; }
 *
 * `main.log` of a test run says it out loud: "[shared storage] Creating shared
 * storage database at ':memory:'", and no `state.vscdb` is ever created in the
 * profile. Mocha therefore *cannot* observe what a previous run persisted - the
 * old "phase 1 writes, phase 2 reads" design was checking nothing.
 *
 * The persistence phases are started as **normal** editor launches instead (no
 * `--extensionTestsPath`), with this module acting as a throw-away extension:
 * `out/test/runIntegration.js` generates
 * `<profile>/extensions/extension-sorter-test.state-driver-1.0.0` whose
 * `extension.js` requires this compiled module and calls `run()`.
 *
 * A real launch always exits with code `0`, no matter what an extension does, so
 * everything is reported through a JSON file (`EXTENSION_SORTER_TEST_DRIVER_RESULT`)
 * that the runner reads and turns into a pass/fail.
 */

const EXTENSION_ID = 'lilinhuang.extension-sorter';

/** A launch that recorded the state it was asked to keep. */
const WRITE = 'write';
/** A launch that verifies the state of a previous launch survived. */
const READ = 'read';

type DriverMode = typeof WRITE | typeof READ;

interface DriverReport {
  mode: string;
  ok: boolean;
  failures: string[];
  details: Record<string, unknown>;
}

/** `undefined` for any other phase, so the driver stays out of the mocha run. */
function readMode(): DriverMode | undefined {
  const phase = process.env['EXTENSION_SORTER_TEST_PHASE'];
  return phase === WRITE || phase === READ ? phase : undefined;
}

function readFakeIds(): string[] {
  return (process.env['EXTENSION_SORTER_TEST_EXT_IDS'] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function readNumber(name: string): number {
  const value = Number(process.env[name] ?? '0');
  return Number.isFinite(value) ? value : 0;
}

/**
 * The editor is shut down gracefully - that is the only way its storage is
 * flushed - and the returned promise never settles because the process goes away
 * first.
 */
async function quitEditor(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.quit');
  await new Promise(() => undefined);
}

export async function run(): Promise<void> {
  const mode = readMode();
  if (!mode) {
    // The "suite" phase runs with `--extensionTestsPath`; this extension is only
    // loaded because it shares the extensions folder with the other phases. It
    // must not report anything and, above all, not shut the editor down.
    return;
  }
  const report: DriverReport = { mode, ok: false, failures: [], details: {} };
  const resultFile = process.env['EXTENSION_SORTER_TEST_DRIVER_RESULT'] ?? '';

  const writeReport = (): void => {
    report.ok = report.failures.length === 0;
    try {
      fs.writeFileSync(resultFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    } catch (error) {
      // Nothing left to report to - the runner will notice the missing file.
      console.error(`Could not write the driver report to ${resultFile}: ${String(error)}`);
    }
  };

  try {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
      throw new Error(`the extension under development must be visible as ${EXTENSION_ID}`);
    }
    const api: ExtensionSorterApi = await extension.activate();
    const entries = Object.entries(api.history.entries);
    report.details['extensions'] = entries.length;
    report.details['sortMode'] = api.state.sortMode;

    if (mode === WRITE) {
      const startedAt = readNumber('EXTENSION_SORTER_TEST_STARTED_AT');

      // A fresh profile must start from the configured default, and the initial
      // scan must only observe: everything that is already installed is "first
      // seen" during this run, and nothing may be labelled as a fresh install.
      if (api.state.sortMode !== 'newest') {
        report.failures.push(`a fresh profile must start with the default sort order, found "${api.state.sortMode}"`);
      }
      if (entries.length === 0) {
        report.failures.push('the initial scan must record what is installed');
      }
      for (const [id, entry] of entries) {
        if (entry.firstSeenAt < startedAt - 1000) {
          report.failures.push(`${id} carries a "first seen" date from an earlier profile (${entry.firstSeenAt} < ${startedAt})`);
        }
        if (entry.installObservedAt !== undefined) {
          report.failures.push(`${id} must not be reported as a freshly observed install`);
        }
      }

      await api.state.setSortMode('nameDesc');
      if (new ViewStateService(api.context.globalState).load() !== 'nameDesc') {
        report.failures.push('the sort order did not end up in globalState');
      }
      report.details['sortModeAfterWrite'] = api.state.sortMode;
    } else {
      const startedAt = readNumber('EXTENSION_SORTER_TEST_STARTED_AT');

      if (new ViewStateService(api.context.globalState).load() !== 'nameDesc') {
        report.failures.push(`the stored sort order did not survive the restart, found "${api.state.sortMode}"`);
      }
      for (const id of readFakeIds()) {
        const entry = api.history.entries[id];
        if (!entry) {
          report.failures.push(`no history entry for ${id} after the restart`);
          continue;
        }
        // The previous editor was fully shut down before this one started, so a
        // "first seen" date of this run means the record was written from scratch.
        if (entry.firstSeenAt >= startedAt) {
          report.failures.push(`${id} was re-dated during this run (${entry.firstSeenAt} >= ${startedAt}); "first seen" must survive a restart`);
        }
        if (entry.installObservedAt !== undefined) {
          report.failures.push(`${id} existed before this run and must not be reported as a fresh install`);
        }
      }
      report.details['checkedIds'] = readFakeIds();
    }
  } catch (error) {
    report.failures.push(String((error as Error)?.stack ?? error));
  }

  writeReport();
  console.log(`[driver:${mode}] ${report.ok ? 'ok' : 'failed'} ${JSON.stringify(report.details)}`);
  if (!report.ok) {
    console.log(`[driver:${mode}] failures:\n- ${report.failures.join('\n- ')}`);
  }

  await quitEditor();
}
