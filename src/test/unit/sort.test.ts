import * as assert from 'assert';
import { SorterExtension } from '../../models/extensionInfo';
import {
  applyViewOptions,
  countByFilter,
  filterExtensions,
  isFilterMode,
  isSortMode,
  matchesQuery,
  sortExtensions,
} from '../../services/sortService';

const JANUARY_1_2026 = Date.UTC(2026, 0, 1);

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

function ids(list: readonly SorterExtension[]): string[] {
  return list.map((extension) => extension.id);
}

const alpha = makeExtension({ id: 'acme.alpha', name: 'Alpha', installDateMs: JANUARY_1_2026, installDateSource: 'file-birthtime' });
const beta = makeExtension({ id: 'acme.beta', name: 'Beta', installDateMs: JANUARY_1_2026 + 1000, installDateSource: 'install-recorded' });
const gamma = makeExtension({ id: 'acme.gamma', name: 'Gamma', installDateMs: JANUARY_1_2026 - 5000, installDateSource: 'file-birthtime' });
const unknownDate = makeExtension({ id: 'acme.delta', name: 'Delta' });
const theme = makeExtension({
  id: 'acme.theme',
  name: 'Theme For Testing',
  installDateMs: JANUARY_1_2026 + 2000,
  installDateSource: 'file-birthtime',
  isTheme: true,
  themeCount: 3,
});

const fixture: SorterExtension[] = [alpha, beta, gamma, unknownDate, theme];

describe('sortService - validation', () => {
  it('accepts known sort and filter modes only', () => {
    assert.strictEqual(isSortMode('newest'), true);
    assert.strictEqual(isSortMode('nameAsc'), true);
    assert.strictEqual(isSortMode('newest-first'), false);
    assert.strictEqual(isSortMode(undefined), false);

    assert.strictEqual(isFilterMode('themes'), true);
    assert.strictEqual(isFilterMode('random'), false);
    assert.strictEqual(isFilterMode(7), false);
  });
});

describe('sortService - date sorting', () => {
  it('sorts newest first and keeps unknown dates at the end', () => {
    const sorted = sortExtensions(fixture, 'newest');
    assert.deepStrictEqual(ids(sorted), ['acme.theme', 'acme.beta', 'acme.alpha', 'acme.gamma', 'acme.delta']);
  });

  it('sorts oldest first and still keeps unknown dates at the end', () => {
    const sorted = sortExtensions(fixture, 'oldest');
    assert.deepStrictEqual(ids(sorted), ['acme.gamma', 'acme.alpha', 'acme.beta', 'acme.theme', 'acme.delta']);
  });

  it('uses the extension name as stable secondary criterion', () => {
    const first = makeExtension({ id: 'acme.zeta', name: 'Zeta', installDateMs: JANUARY_1_2026, installDateSource: 'file-birthtime' });
    const second = makeExtension({ id: 'acme.omega', name: 'Omega', installDateMs: JANUARY_1_2026, installDateSource: 'file-birthtime' });
    assert.deepStrictEqual(ids(sortExtensions([first, second], 'newest')), ['acme.omega', 'acme.zeta']);
    assert.deepStrictEqual(ids(sortExtensions([first, second], 'oldest')), ['acme.omega', 'acme.zeta']);
  });

  it('never mutates the input list', () => {
    const input = [...fixture];
    sortExtensions(input, 'newest');
    assert.deepStrictEqual(ids(input), ids(fixture));
  });
});

describe('sortService - name sorting', () => {
  const names = [
    makeExtension({ id: 'acme.b', name: 'beta' }),
    makeExtension({ id: 'acme.a', name: 'Alpha' }),
    makeExtension({ id: 'acme.c', name: 'Gamma' }),
  ];

  it('sorts A-Z case insensitively', () => {
    assert.deepStrictEqual(sortExtensions(names, 'nameAsc').map((extension) => extension.name), ['Alpha', 'beta', 'Gamma']);
  });

  it('sorts Z-A', () => {
    assert.deepStrictEqual(sortExtensions(names, 'nameDesc').map((extension) => extension.name), ['Gamma', 'beta', 'Alpha']);
  });
});

describe('sortService - search', () => {
  it('matches name, publisher and id', () => {
    assert.strictEqual(matchesQuery(alpha, 'alph'), true);
    assert.strictEqual(matchesQuery(alpha, 'ACME'), true);
    assert.strictEqual(matchesQuery(alpha, 'acme.alpha'), true);
    assert.strictEqual(matchesQuery(alpha, 'nope'), false);
  });

  it('treats whitespace and an empty query as "everything"', () => {
    assert.strictEqual(matchesQuery(alpha, ''), true);
    assert.strictEqual(matchesQuery(alpha, '   '), true);
  });

  it('requires every word to match somewhere', () => {
    assert.strictEqual(matchesQuery(theme, 'acme testing'), true);
    assert.strictEqual(matchesQuery(theme, 'acme missing'), false);
  });

  it('does not search the description', () => {
    const described = makeExtension({ id: 'acme.desc', name: 'Pretty', description: 'a hidden keyword' });
    assert.strictEqual(matchesQuery(described, 'hidden'), false);
  });
});

describe('sortService - filtering and view options', () => {
  it('filters themes only', () => {
    assert.deepStrictEqual(ids(filterExtensions(fixture, 'themes')), ['acme.theme']);
  });

  it('filters non themes', () => {
    assert.deepStrictEqual(ids(filterExtensions(fixture, 'nonThemes')), ['acme.alpha', 'acme.beta', 'acme.gamma', 'acme.delta']);
  });

  it('combines filter, query and sort order', () => {
    const visible = applyViewOptions(fixture, { sortMode: 'newest', filterMode: 'themes', query: 'theme' });
    assert.deepStrictEqual(ids(visible), ['acme.theme']);
    assert.deepStrictEqual(applyViewOptions(fixture, { sortMode: 'newest', filterMode: 'themes', query: 'alpha' }), []);
  });

  it('keeps the filtered result sorted by install date', () => {
    const themes = [
      makeExtension({ id: 'acme.old-theme', name: 'Old Theme', isTheme: true, installDateMs: JANUARY_1_2026, installDateSource: 'file-birthtime' }),
      makeExtension({ id: 'acme.new-theme', name: 'New Theme', isTheme: true, installDateMs: JANUARY_1_2026 + 5000, installDateSource: 'file-birthtime' }),
    ];
    assert.deepStrictEqual(ids(applyViewOptions(themes, { sortMode: 'newest', filterMode: 'themes', query: '' })), [
      'acme.new-theme',
      'acme.old-theme',
    ]);
  });

  it('counts what each filter would show', () => {
    const counts = countByFilter(fixture);
    assert.strictEqual(counts.total, 5);
    assert.strictEqual(counts.all, 5);
    assert.strictEqual(counts.themes, 1);
    assert.strictEqual(counts.nonThemes, 4);
  });
});
