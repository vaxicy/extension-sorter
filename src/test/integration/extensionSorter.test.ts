import * as assert from 'assert';
import * as vscode from 'vscode';
import { isExtensionOpenAvailable, openExtensionDetails } from '../../commands/extensionCommands';
import { ExtensionSorterApi } from '../../extension';
import { SorterExtension } from '../../models/extensionInfo';
import { applyViewOptions } from '../../services/sortService';

/**
 * Integration tests - these run inside a real VS Code extension host.
 *
 * `out/test/runIntegration.js` prepares an isolated profile with two fake
 * "installed" extensions and starts VS Code three times with it: `write` and
 * `read` check persistence across a restart (with a helper extension, because
 * `--extensionTestsPath` forces every storage database to `:memory:` - see
 * `runIntegration.ts`), and this suite covers what happens *inside* one session.
 */

const EXTENSION_ID = 'lilinhuang.extension-sorter';
const DUMMY_IDS = (process.env['EXTENSION_SORTER_TEST_EXT_IDS'] ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

const CONTRIBUTED_COMMANDS = [
  'extensionSorter.sort',
  'extensionSorter.filter',
  'extensionSorter.search',
  'extensionSorter.refresh',
  'extensionSorter.clearFilters',
  'extensionSorter.openDetails',
  'extensionSorter.copyId',
  'extensionSorter.openInMarketplace',
];

let api: ExtensionSorterApi;
let installed: SorterExtension[];

function findRow(rows: readonly SorterExtension[], id: string): SorterExtension {
  const row = rows.find((candidate) => candidate.id === id);
  assert.ok(row, `expected "${id}" in the list of installed extensions`);
  return row as SorterExtension;
}

function tooltipText(item: vscode.TreeItem): string {
  return item.tooltip instanceof vscode.MarkdownString ? item.tooltip.value : String(item.tooltip);
}

before(async () => {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `the extension under development must be visible as ${EXTENSION_ID}`);
  api = await extension!.activate();
  installed = await api.service.readExtensions();
});

describe('activation', () => {
  it('registers every contributed command', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = CONTRIBUTED_COMMANDS.filter((command) => !registered.has(command));
    assert.deepStrictEqual(missing, [], `not registered: ${missing.join(', ')}`);
  });

  it('contributes the "Installed by Date" view', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    assert.ok(
      registered.has('extensionSorter.installedByDate.focus'),
      'VS Code must have registered the contributed view (its focus command exists for every registered view)',
    );
  });

  it('feeds the view through the tree data provider', async () => {
    const children = await api.provider.getChildren();
    assert.ok(children.length > 0, 'the provider must return rows');
    assert.strictEqual(children.length, api.provider.getSnapshot().visible);
  });

  it('can evaluate the QuickPick based commands without them being run', () => {
    // Sorting/filtering is pure, so the result of a pick can be verified here;
    // the QuickPick itself needs a user, which is what the manual checklist is for.
    const rows = applyViewOptions(installed, { sortMode: 'nameAsc', filterMode: 'all', query: '' });
    const names = rows.map((row) => row.name.toLocaleLowerCase('en'));
    assert.deepStrictEqual(names, [...names].sort(), 'the Name A-Z order must be alphabetical');
  });
});

describe('opening the native extension details page', () => {
  it('finds the built-in command the Extensions view itself uses', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    assert.ok(registered.has('extension.open'), '"extension.open" must exist in this VS Code build');
    assert.strictEqual(await isExtensionOpenAvailable({ log: api.log }), true);
  });

  it('executes extension.open for an installed extension', async () => {
    await openExtensionDetails(EXTENSION_ID, { log: api.log });

    // Best effort visual proof: the details editor shows up as a tab named after
    // the extension. Not every build surfaces it in tabGroups, so a missing tab
    // is reported instead of failing the run.
    const displayName = String(vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.displayName ?? 'Extension Sorter');
    const deadline = Date.now() + 5_000;
    let found = false;
    while (!found && Date.now() < deadline) {
      found = vscode.window.tabGroups.all.some((group) =>
        group.tabs.some((tab) => typeof tab.label === 'string' && tab.label.includes(displayName)),
      );
      if (!found) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    console.log(
      found
        ? `[ok] the native details editor for "${displayName}" is open in an editor tab`
        : '[note] the details editor did not show up in vscode.window.tabGroups; the command ran without an error - confirm visually once.',
    );
  });

  it('survives an id that does not exist', async () => {
    await Promise.race([
      openExtensionDetails('does-not-exist.nothing', { log: api.log }),
      new Promise((resolve) => setTimeout(resolve, 8_000)),
    ]);
  });
});

describe('reading the installed extensions', () => {
  it('excludes built-in extensions by default', () => {
    assert.ok(installed.length > 0);
    assert.deepStrictEqual(
      installed.filter((row) => row.isBuiltin),
      [],
      'no built-in extension may be part of the default list',
    );
  });

  it('includes built-in extensions when the setting is enabled', async () => {
    const configuration = vscode.workspace.getConfiguration('extensionSorter');
    await configuration.update('includeBuiltInExtensions', true, vscode.ConfigurationTarget.Global);
    try {
      const withBuiltIns = await api.service.readExtensions();
      assert.ok(withBuiltIns.length > installed.length, 'built-in extensions must be added to the list');
      const builtIns = withBuiltIns.filter((row) => row.isBuiltin);
      assert.ok(builtIns.length > 0, 'at least one row must be flagged as built-in');
      console.log(
        `[info] ${builtIns.length} built-in extensions detected, e.g. ${builtIns.slice(0, 5).map((row) => row.id).join(', ')}`,
      );
    } finally {
      await configuration.update('includeBuiltInExtensions', false, vscode.ConfigurationTarget.Global);
    }
  });

  it('gives every row an id, a publisher and a valid date source', () => {
    const validSources = ['install-recorded', 'install-observed', 'file-birthtime', 'file-ctime', 'first-seen', 'unknown'];
    for (const row of installed) {
      assert.ok(row.id.length > 0, 'id');
      assert.ok(row.name.length > 0, `name of ${row.id}`);
      assert.ok(row.publisher.length > 0, `publisher of ${row.id}`);
      assert.ok(validSources.includes(row.installDateSource), `unexpected date source "${row.installDateSource}" for ${row.id}`);
    }
  });

  it('sorts newest first, oldest first, and keeps unknown dates last', () => {
    const newest = applyViewOptions(installed, { sortMode: 'newest', filterMode: 'all', query: '' });
    const oldest = applyViewOptions(installed, { sortMode: 'oldest', filterMode: 'all', query: '' });
    assert.deepStrictEqual([...newest].map((row) => row.id).sort(), [...oldest].map((row) => row.id).sort());

    const assertMonotonic = (rows: readonly SorterExtension[], descending: boolean): void => {
      let unknownSeen = false;
      let previous: number | undefined;
      for (const row of rows) {
        const known = typeof row.installDateMs === 'number' && row.installDateSource !== 'unknown';
        if (!known) {
          unknownSeen = true;
          continue;
        }
        assert.strictEqual(unknownSeen, false, `${row.id} has a date but comes after an unknown date`);
        if (previous !== undefined) {
          assert.ok(
            descending ? previous >= (row.installDateMs as number) : previous <= (row.installDateMs as number),
            `dates are not monotonic at ${row.id}`,
          );
        }
        previous = row.installDateMs as number;
      }
    };
    assertMonotonic(newest, true);
    assertMonotonic(oldest, false);
  });

  it('treats an unreadable extension folder as "unknown" instead of failing', async () => {
    const date = await api.dates.resolveFor(
      { extensionPath: 'Z:\\this\\folder\\does\\not\\exist', packageJSON: {}, fileSystemReadable: true },
      undefined,
    );
    assert.deepStrictEqual(date, { source: 'unknown' });
  });
});

if (DUMMY_IDS.length === 0) {
  console.log('[note] the fake "installed" extension checks are skipped (EXTENSION_SORTER_TEST_EXT_IDS is not set).');
} else {
  const themeId = DUMMY_IDS[0];
  const toolId = DUMMY_IDS[1];

  describe('fake installed extensions', () => {
    it('lists both extensions of the isolated profile', () => {
      findRow(installed, themeId);
      findRow(installed, toolId);
    });

    it('detects a theme through contributes.themes, not through the name', () => {
      const theme = findRow(installed, themeId);
      assert.strictEqual(theme.isTheme, true);
      assert.strictEqual(theme.themeCount, 2);
      assert.strictEqual(theme.name, 'Apricot Glow Theme');
      assert.strictEqual(theme.publisher, 'contoso');
      assert.strictEqual(findRow(installed, toolId).isTheme, false);
    });

    it('uses the install timestamp recorded by VS Code', () => {
      const theme = findRow(installed, themeId);
      assert.strictEqual(theme.installDateSource, 'install-recorded');
      assert.strictEqual(theme.installDateMs, Date.UTC(2026, 0, 15, 10, 0, 0));
    });

    it('estimates the date from the folder when nothing was recorded', () => {
      const tool = findRow(installed, toolId);
      assert.notStrictEqual(tool.installDateSource, 'unknown');
      assert.ok(typeof tool.installDateMs === 'number');
      assert.ok(Date.now() - (tool.installDateMs as number) < 60 * 60 * 1000, 'the folder was created moments ago');
    });

    it('resolves icons that live inside the extension folder', () => {
      const theme = findRow(installed, themeId);
      assert.ok(theme.iconPath, 'the icon of the fake theme must be resolved');
      assert.ok(theme.iconPath!.toLowerCase().endsWith('icon.png'));
      assert.strictEqual(theme.iconPath!.includes('..'), false);
      assert.strictEqual(findRow(installed, toolId).iconPath, undefined);
    });

    it('orders the newest install first', () => {
      const sorted = applyViewOptions(installed, { sortMode: 'newest', filterMode: 'all', query: '' });
      const themeIndex = sorted.findIndex((row) => row.id === themeId);
      const toolIndex = sorted.findIndex((row) => row.id === toolId);
      assert.ok(toolIndex >= 0 && themeIndex >= 0);
      assert.ok(toolIndex < themeIndex, 'the extension installed today must come before the January install');
      assert.strictEqual(sorted[sorted.length - 1].id, themeId, 'the oldest install is at the end of a flat list');
    });

    it('filters themes on real data', () => {
      const themes = applyViewOptions(installed, { sortMode: 'newest', filterMode: 'themes', query: '' });
      assert.ok(themes.some((row) => row.id === themeId));
      assert.strictEqual(
        themes.some((row) => row.id === toolId),
        false,
      );

      const nonThemes = applyViewOptions(installed, { sortMode: 'newest', filterMode: 'nonThemes', query: '' });
      assert.ok(nonThemes.some((row) => row.id === toolId));
      assert.strictEqual(
        nonThemes.some((row) => row.id === themeId),
        false,
      );
    });

    it('searches by name, publisher and id, and combines with the filter', () => {
      assert.deepStrictEqual(
        applyViewOptions(installed, { sortMode: 'newest', filterMode: 'all', query: 'apricot glow' }).map((row) => row.id),
        [themeId],
      );
      assert.deepStrictEqual(
        applyViewOptions(installed, { sortMode: 'newest', filterMode: 'all', query: 'fabrikam' }).map((row) => row.id),
        [toolId],
      );
      assert.deepStrictEqual(
        applyViewOptions(installed, { sortMode: 'newest', filterMode: 'all', query: toolId }).map((row) => row.id),
        [toolId],
      );
      assert.deepStrictEqual(applyViewOptions(installed, { sortMode: 'newest', filterMode: 'themes', query: 'fabrikam' }), []);
    });

    it('renders a tree item for a row', () => {
      const item = api.provider.getTreeItem(findRow(installed, themeId));
      assert.strictEqual(item.label, 'Apricot Glow Theme');
      assert.strictEqual(item.contextValue, 'extensionSorter.theme');
      assert.ok(String(item.description).includes('contoso'));
      assert.ok(/Estimated|Installed/.test(String(item.description)), `unexpected description: ${String(item.description)}`);
      assert.ok(tooltipText(item).includes('contoso.apricot-glow-theme'));
      assert.deepStrictEqual((item.command as vscode.Command).arguments, [themeId]);
    });
  });
}

// Cross-restart persistence is *not* checked here: this suite runs with
// `--extensionTestsPath`, which makes VS Code keep every storage database in
// memory (`[shared storage] Creating shared storage database at ':memory:'` in
// its main log), so nothing written by a test run reaches `state.vscdb`. That
// check lives in the "write" and "read" phases of `src/test/runIntegration.ts`,
// which drive a real editor through `src/test/integration/stateDriver.ts`.
if (process.env['EXTENSION_SORTER_TEST_PHASE'] !== 'suite') {
  console.log('[note] run "npm run test:integration" to also verify that the state survives a restart.');
}
