import * as assert from 'assert';
import {
  HISTORY_STORAGE_KEY,
  InstallHistory,
  InstallHistoryService,
  MAX_HISTORY_ENTRIES,
  MementoLike,
  mergeSnapshot,
  normalizeId,
  pruneHistory,
  sanitizeHistory,
} from '../../services/installHistoryService';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9);

interface MemoryMemento {
  memento: MementoLike;
  writes: number;
  stored: unknown;
}

function makeMemoryMemento(initial: Record<string, unknown> = {}): MemoryMemento {
  const store = new Map<string, unknown>(Object.entries(initial));
  const state: MemoryMemento = {
    memento: {
      get<T>(key: string, defaultValue: T): T {
        return store.has(key) ? (store.get(key) as T) : defaultValue;
      },
      update(key: string, value: unknown): Promise<void> {
        state.writes += 1;
        store.set(key, value);
        return Promise.resolve();
      },
    },
    writes: 0,
    get stored(): unknown {
      return store.get(HISTORY_STORAGE_KEY);
    },
  };
  return state;
}

describe('installHistoryService - sanitizing persisted data', () => {
  it('drops junk entries and normalizes ids', () => {
    const history = sanitizeHistory({
      'Acme.Alpha': { firstSeenAt: 100, lastSeenAt: 200, firstSeenVersion: '1.0.0' },
      broken: { firstSeenAt: 'yesterday' },
      array: [1, 2, 3],
      nullish: null,
      '': { firstSeenAt: 1 },
      'acme.beta': { firstSeenAt: 300, installObservedAt: 400 },
    });
    assert.deepStrictEqual(Object.keys(history).sort(), ['acme.alpha', 'acme.beta']);
    assert.strictEqual(history['acme.alpha'].lastSeenAt, 200);
    assert.strictEqual(history['acme.beta'].lastSeenAt, 300, 'lastSeenAt defaults to firstSeenAt');
    assert.strictEqual(history['acme.beta'].installObservedAt, 400);
  });

  it('turns anything that is not an object into an empty history', () => {
    assert.deepStrictEqual(sanitizeHistory(undefined), {});
    assert.deepStrictEqual(sanitizeHistory('nope'), {});
    assert.deepStrictEqual(sanitizeHistory([1, 2]), {});
  });

  it('normalizes ids the same way everywhere', () => {
    assert.strictEqual(normalizeId('  Acme.Alpha '), 'acme.alpha');
  });
});

describe('installHistoryService - merging a scan', () => {
  it('records newly seen extensions but does not claim an install during the initial scan', () => {
    const merged = mergeSnapshot({}, [{ id: 'acme.alpha', version: '1.0.0' }], {
      initialScan: true,
      now: NOW,
      retentionDays: 180,
      observedInstallIds: new Set(['acme.alpha']),
    });
    assert.strictEqual(merged['acme.alpha'].firstSeenAt, NOW);
    assert.strictEqual(merged['acme.alpha'].firstSeenVersion, '1.0.0');
    assert.strictEqual(merged['acme.alpha'].installObservedAt, undefined);
  });

  it('records an observed install for extensions that appeared while running', () => {
    const merged = mergeSnapshot({}, [{ id: 'acme.alpha', version: '1.0.0' }], {
      initialScan: false,
      now: NOW,
      retentionDays: 180,
      observedInstallIds: new Set(['acme.alpha']),
    });
    assert.strictEqual(merged['acme.alpha'].installObservedAt, NOW);
  });

  it('keeps the first seen date when an extension is updated', () => {
    const history: InstallHistory = { 'acme.alpha': { firstSeenAt: NOW - 10 * DAY, lastSeenAt: NOW - 10 * DAY, firstSeenVersion: '1.0.0' } };
    const merged = mergeSnapshot(history, [{ id: 'acme.alpha', version: '2.0.0' }], { initialScan: true, now: NOW, retentionDays: 180 });
    assert.strictEqual(merged['acme.alpha'].firstSeenAt, NOW - 10 * DAY);
    assert.strictEqual(merged['acme.alpha'].firstSeenVersion, '1.0.0');
    assert.strictEqual(merged['acme.alpha'].lastSeenAt, NOW);
  });

  it('remembers an observed install forever', () => {
    const observedAt = NOW - 5 * DAY;
    const history: InstallHistory = { 'acme.alpha': { firstSeenAt: observedAt, lastSeenAt: observedAt, installObservedAt: observedAt } };
    const merged = mergeSnapshot(history, [{ id: 'acme.alpha', version: '1.0.0' }], {
      initialScan: false,
      now: NOW,
      retentionDays: 180,
      observedInstallIds: new Set(),
    });
    assert.strictEqual(merged['acme.alpha'].installObservedAt, observedAt);
  });

  it('keeps uninstalled extensions until the retention window is over', () => {
    const history: InstallHistory = {
      'acme.gone': { firstSeenAt: NOW - 30 * DAY, lastSeenAt: NOW - 30 * DAY },
      'acme.ancient': { firstSeenAt: NOW - 400 * DAY, lastSeenAt: NOW - 400 * DAY },
    };
    const merged = mergeSnapshot(history, [], { initialScan: true, now: NOW, retentionDays: 180 });
    assert.deepStrictEqual(Object.keys(merged), ['acme.gone']);
  });

  it('enforces the hard cap', () => {
    const history: InstallHistory = {};
    for (let index = 0; index < MAX_HISTORY_ENTRIES + 20; index += 1) {
      history[`acme.ext${index}`] = { firstSeenAt: NOW - index * 1000, lastSeenAt: NOW - index * 1000 };
    }
    assert.strictEqual(Object.keys(pruneHistory(history, NOW, 180)).length, MAX_HISTORY_ENTRIES);
  });
});

describe('installHistoryService - storage', () => {
  it('round-trips through the memento and only writes when something changed', async () => {
    const memory = makeMemoryMemento();
    const service = new InstallHistoryService(memory.memento);
    service.load();

    await service.record([{ id: 'acme.alpha', version: '1.0.0' }], { initialScan: true, now: NOW });
    assert.strictEqual(memory.writes, 1);

    // Same scan, same timestamp: nothing to persist.
    await service.record([{ id: 'acme.alpha', version: '1.0.0' }], { initialScan: true, now: NOW });
    assert.strictEqual(memory.writes, 1);

    const reloaded = new InstallHistoryService(memory.memento);
    reloaded.load();
    assert.strictEqual(reloaded.get('ACME.ALPHA')?.firstSeenAt, NOW);
    assert.strictEqual(reloaded.get('acme.unknown'), undefined);
  });

  it('recovers from corrupted persisted data', () => {
    const memory = makeMemoryMemento({ [HISTORY_STORAGE_KEY]: 'not json we wrote' });
    const service = new InstallHistoryService(memory.memento);
    assert.deepStrictEqual(service.load(), {});
    assert.strictEqual(service.get('acme.alpha'), undefined);
  });
});
