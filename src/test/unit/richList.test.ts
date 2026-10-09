import * as assert from 'assert';
import { formatInstallDateTime } from '../../models/dateFormat';
import { SorterExtension } from '../../models/extensionInfo';
import {
  DEFAULT_GROUP_BY,
  GROUP_BY_VALUES,
  buildPlainTooltip,
  buildRichListModel,
  effectiveGroupBy,
  isGroupBy,
} from '../../models/richList';
import { applyViewOptions } from '../../services/sortService';

// Built from the *local* calendar on purpose: the assertions below talk about
// "Oct 9" and "October 2026", which must hold in every time zone.
const NOW = new Date(2026, 9, 10, 12, 0).getTime();
const OCT_9_2026 = new Date(2026, 9, 9, 12, 0).getTime();
const OCT_4_2026 = new Date(2026, 9, 4, 8, 0).getTime();
const SEP_20_2026 = new Date(2026, 8, 20, 9, 30).getTime();
const AUG_5_2025 = new Date(2025, 7, 5).getTime();

function makeExtension(overrides: Partial<SorterExtension> & { id: string; name: string }): SorterExtension {
  const extension: SorterExtension = {
    publisher: overrides.id.split('.')[0] ?? 'unknown',
    version: '1.0.0',
    description: '',
    isTheme: false,
    themeCount: 0,
    isBuiltin: false,
    extensionPath: '',
    installDateSource: 'unknown',
    ...overrides,
  };
  if (typeof overrides.installDateMs === 'number' && overrides.installDateSource === undefined) {
    extension.installDateSource = 'file-birthtime';
  }
  return extension;
}

function buildModel(
  all: readonly SorterExtension[],
  options: { sortMode?: 'newest' | 'oldest' | 'nameAsc' | 'nameDesc'; filterMode?: 'all' | 'themes' | 'nonThemes'; query?: string; groupBy?: 'none' | 'month' | 'year'; iconUri?: (extension: SorterExtension) => string | undefined } = {},
) {
  const sortMode = options.sortMode ?? 'newest';
  const filterMode = options.filterMode ?? 'all';
  const query = options.query ?? '';
  const visible = applyViewOptions(all, { sortMode, filterMode, query });
  const model = buildRichListModel({
    all,
    visible,
    query,
    sortMode,
    sortLabel: 'Newest first',
    filterLabel: filterMode === 'themes' ? 'themes only' : '',
    isFiltered: filterMode !== 'all' || query.length > 0,
    groupBy: options.groupBy ?? DEFAULT_GROUP_BY,
    now: NOW,
    ...(options.iconUri ? { iconUri: options.iconUri } : {}),
  });
  return { model, visible };
}

const lavender = makeExtension({
  id: 'lilinhuang.lavender',
  name: 'Lavender Parchment Theme',
  publisher: 'lilinhuang',
  description: 'Quiet lavender,\n warm   parchment',
  isTheme: true,
  themeCount: 12,
  installDateMs: OCT_9_2026,
  installDateSource: 'file-birthtime',
});
const apricot = makeExtension({
  id: 'contoso.apricot',
  name: 'Apricot Glow Theme',
  publisher: 'contoso',
  isTheme: true,
  themeCount: 1,
  installDateMs: OCT_4_2026,
  installDateSource: 'install-recorded',
});
const iris = makeExtension({
  id: 'lilinhuang.iris',
  name: 'Iris Cloud Theme',
  isTheme: true,
  installDateMs: SEP_20_2026,
  installDateSource: 'file-birthtime',
});
const oldTimer = makeExtension({
  id: 'acme.old-timer',
  name: 'Old Timer',
  installDateMs: AUG_5_2025,
  installDateSource: 'install-recorded',
});
const undated = makeExtension({ id: 'acme.undated', name: 'Undated' });
const all = [lavender, apricot, iris, oldTimer, undated];

describe('richList grouping options', () => {
  it('validates the group values and keeps month as the default', () => {
    assert.deepStrictEqual([...GROUP_BY_VALUES], ['none', 'month', 'year']);
    assert.strictEqual(DEFAULT_GROUP_BY, 'month');
    assert.strictEqual(isGroupBy('month'), true);
    assert.strictEqual(isGroupBy('week'), false);
    assert.strictEqual(isGroupBy(undefined), false);
  });

  it('only groups the date sort orders', () => {
    assert.strictEqual(effectiveGroupBy('newest', 'month'), 'month');
    assert.strictEqual(effectiveGroupBy('oldest', 'year'), 'year');
    assert.strictEqual(effectiveGroupBy('nameAsc', 'month'), 'none');
    assert.strictEqual(effectiveGroupBy('nameDesc', 'year'), 'none');
  });
});

describe('richList rows', () => {
  it('builds the second line from publisher, description and theme count', () => {
    const { model } = buildModel([lavender]);
    const row = model.groups[0]!.rows[0]!;
    assert.strictEqual(row.name, 'Lavender Parchment Theme');
    assert.strictEqual(row.subtitle, 'lilinhuang · Quiet lavender, warm parchment · 12 color themes');
    assert.strictEqual(row.dateText, 'Oct 9, 2026');
  });

  it('marks how trustworthy the date is instead of hiding it', () => {
    const { model } = buildModel([apricot, lavender]);
    const rows = model.groups[0]!.rows;
    assert.deepStrictEqual(rows.map((row) => row.id), ['lilinhuang.lavender', 'contoso.apricot'], 'newest first');
    assert.strictEqual(rows[0]!.dateIsExact, false, 'a folder timestamp is an estimate');
    assert.strictEqual(rows[0]!.dateSourceLabel, 'Estimated');
    assert.strictEqual(rows[1]!.dateIsExact, true, 'an install recorded by VS Code is exact');
    assert.strictEqual(rows[1]!.dateSourceLabel, 'Installed');
  });

  it('falls back to the version when a manifest has no description', () => {
    const { model } = buildModel([apricot]);
    assert.strictEqual(model.groups[0]!.rows[0]!.subtitle, 'contoso · v1.0.0 · 1 color theme');
  });

  it('labels built-in extensions', () => {
    const builtin = makeExtension({
      id: 'vscode.git',
      name: 'Git',
      publisher: 'vscode',
      description: 'Git integration',
      isBuiltin: true,
      installDateMs: OCT_4_2026,
      installDateSource: 'file-birthtime',
    });
    const { model } = buildModel([builtin]);
    assert.strictEqual(model.groups[0]!.rows[0]!.subtitle, 'vscode · Git integration · Built-in');
  });

  it('resolves the icon once per row through the callback', () => {
    let calls = 0;
    const { model } = buildModel(all, {
      iconUri: (extension) => {
        calls += 1;
        return extension.id === 'acme.undated' ? undefined : `webview://${extension.id}`;
      },
    });
    assert.strictEqual(calls, all.length);
    const rows = model.groups.flatMap((group) => group.rows);
    assert.strictEqual(rows.find((row) => row.id === 'lilinhuang.lavender')!.iconUri, 'webview://lilinhuang.lavender');
    assert.strictEqual(rows.find((row) => row.id === 'acme.undated')!.iconUri, undefined);
  });
});

describe('richList groups', () => {
  it('creates one heading per month and keeps the sort order inside them', () => {
    const { model } = buildModel([lavender, apricot, iris, oldTimer, undated]);
    assert.deepStrictEqual(
      model.groups.map((group) => `${group.label} (${group.count})`),
      ['October 2026 (2)', 'September 2026 (1)', 'August 2025 (1)', 'No install date (1)'],
    );
    assert.deepStrictEqual(model.groups[0]!.rows.map((row) => row.id), ['lilinhuang.lavender', 'contoso.apricot']);
    assert.strictEqual(model.groupBy, 'month');
  });

  it('groups by year when asked', () => {
    const { model } = buildModel([lavender, iris, oldTimer, undated], { groupBy: 'year' });
    assert.deepStrictEqual(model.groups.map((group) => group.label), ['2026', '2025', 'No install date']);
  });

  it('leaves the list flat when grouping is off or the order is alphabetical', () => {
    const flat = buildModel(all, { groupBy: 'none' }).model;
    assert.deepStrictEqual(flat.groups.map((group) => group.label), ['']);
    assert.strictEqual(flat.groups[0]!.count, all.length);

    const byName = buildModel(all, { sortMode: 'nameAsc', groupBy: 'month' }).model;
    assert.strictEqual(byName.groupBy, 'none');
    assert.deepStrictEqual(byName.groups.map((group) => group.label), ['']);
    assert.deepStrictEqual(byName.groups[0]!.rows.map((row) => row.name), [
      'Apricot Glow Theme',
      'Iris Cloud Theme',
      'Lavender Parchment Theme',
      'Old Timer',
      'Undated',
    ]);
  });
});

describe('richList summary', () => {
  it('keeps the full total next to the filtered count', () => {
    const { model } = buildModel(all, { filterMode: 'themes' });
    assert.strictEqual(model.total, 5);
    assert.strictEqual(model.shown, 3);
    assert.strictEqual(model.isFiltered, true);
    assert.strictEqual(model.filterLabel, 'themes only');
    assert.strictEqual(model.emptyMessage, undefined);
  });

  it('explains an empty result from a filter and an empty installation', () => {
    const filtered = buildModel(all, { filterMode: 'nonThemes', query: 'nothing matches this' }).model;
    assert.strictEqual(filtered.shown, 0);
    assert.match(String(filtered.emptyMessage), /No extension matches/);

    const empty = buildModel([], {}).model;
    assert.strictEqual(empty.total, 0);
    assert.match(String(empty.emptyMessage), /No installed extensions/);
  });
});

describe('richList tooltip', () => {
  it('is plain text that repeats where the date came from', () => {
    const tooltip = buildPlainTooltip(lavender, NOW);
    const lines = tooltip.split('\n');
    assert.strictEqual(lines[0], 'Lavender Parchment Theme');
    assert.strictEqual(lines[1], 'lilinhuang.lavender');
    assert.ok(lines.includes('Publisher: lilinhuang'));
    assert.ok(lines.includes('Version: 1.0.0'));
    assert.ok(
      lines.includes(`Date: ${formatInstallDateTime(OCT_9_2026)} - Estimated (1 day ago)`),
      `unexpected date line: ${lines.find((line) => line.startsWith('Date:'))}`,
    );
    assert.ok(
      lines.some((line) => line.startsWith('Date source: Estimated from the creation time of the extension folder')),
    );
    assert.ok(lines.includes('Themes: 12 color themes'));
    assert.deepStrictEqual(
      lines.filter((line) => line.startsWith('Quiet lavender')),
      ['Quiet lavender, warm parchment'],
      'the description is flattened onto one line',
    );
    assert.ok(!tooltip.includes('**'), 'no markdown bold in a native tooltip');
    assert.ok(!tooltip.includes('`'), 'no markdown code spans in a native tooltip');
  });
});
