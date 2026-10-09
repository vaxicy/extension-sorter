import * as assert from 'assert';
import { formatAge, formatInstallDate, formatInstallDateTime, getInstallDateSourceLabel } from '../../models/dateFormat';
import {
  FUTURE_TOLERANCE_MS,
  MIN_PLAUSIBLE_TIME,
  OBSERVED_INSTALL_WINDOW_MS,
  FileTimes,
  isPlausibleTime,
  pickFileTime,
  resolveInstallDate,
} from '../../services/installDateService';

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0); // Oct 9, 2026
const RECORDED = Date.UTC(2026, 8, 1);
const OBSERVED = Date.UTC(2026, 7, 1);
const BIRTHTIME = Date.UTC(2026, 6, 1);
const CTIME = Date.UTC(2026, 5, 1);
const MTIME = Date.UTC(2026, 4, 1);
const FIRST_SEEN = Date.UTC(2026, 3, 1);

const times: FileTimes = { birthtimeMs: BIRTHTIME, ctimeMs: CTIME, mtimeMs: MTIME };

describe('installDateService - plausibility checks', () => {
  it('rejects unusable file system timestamps', () => {
    assert.strictEqual(isPlausibleTime(0, NOW), false);
    assert.strictEqual(isPlausibleTime(Number.NaN, NOW), false);
    assert.strictEqual(isPlausibleTime(Number.POSITIVE_INFINITY, NOW), false);
    assert.strictEqual(isPlausibleTime(MIN_PLAUSIBLE_TIME - 1, NOW), false);
    assert.strictEqual(isPlausibleTime('2026-01-01', NOW), false);
    assert.strictEqual(isPlausibleTime(undefined, NOW), false);
  });

  it('accepts plausible timestamps, including a small clock skew', () => {
    assert.strictEqual(isPlausibleTime(MIN_PLAUSIBLE_TIME, NOW), true);
    assert.strictEqual(isPlausibleTime(NOW + FUTURE_TOLERANCE_MS, NOW), true);
    assert.strictEqual(isPlausibleTime(NOW + FUTURE_TOLERANCE_MS + 1, NOW), false);
  });
});

describe('installDateService - file system timestamps', () => {
  it('prefers the creation time', () => {
    assert.deepStrictEqual(pickFileTime(times, NOW), { ms: BIRTHTIME, source: 'file-birthtime' });
  });

  it('falls back to the change time when birthtime is unusable', () => {
    const withoutBirthtime: FileTimes = { birthtimeMs: 0, ctimeMs: CTIME, mtimeMs: MTIME };
    assert.deepStrictEqual(pickFileTime(withoutBirthtime, NOW), { ms: CTIME, source: 'file-ctime' });
  });

  it('never uses the modification time', () => {
    const onlyMtime: FileTimes = { birthtimeMs: 0, ctimeMs: 0, mtimeMs: MTIME };
    assert.strictEqual(pickFileTime(onlyMtime, NOW), undefined);
    assert.strictEqual(pickFileTime(undefined, NOW), undefined);
  });
});

describe('installDateService - priority', () => {
  it('uses the timestamp recorded by VS Code first', () => {
    const result = resolveInstallDate({
      recordedTimestamp: RECORDED,
      observedInstallTimestamp: OBSERVED,
      fileTimes: times,
      firstSeenTimestamp: FIRST_SEEN,
      now: NOW,
    });
    assert.deepStrictEqual(result, { ms: RECORDED, source: 'install-recorded' });
  });

  it('uses an observed install when nothing was recorded', () => {
    const result = resolveInstallDate({ observedInstallTimestamp: OBSERVED, fileTimes: times, firstSeenTimestamp: FIRST_SEEN, now: NOW });
    assert.deepStrictEqual(result, { ms: OBSERVED, source: 'install-observed' });
  });

  it('falls back to the folder creation time', () => {
    const result = resolveInstallDate({ fileTimes: times, firstSeenTimestamp: FIRST_SEEN, now: NOW });
    assert.deepStrictEqual(result, { ms: BIRTHTIME, source: 'file-birthtime' });
  });

  it('falls back to the folder change time', () => {
    const result = resolveInstallDate({ fileTimes: { birthtimeMs: 0, ctimeMs: CTIME, mtimeMs: MTIME }, now: NOW });
    assert.deepStrictEqual(result, { ms: CTIME, source: 'file-ctime' });
  });

  it('uses "first seen" only as the last resort before unknown', () => {
    const result = resolveInstallDate({ firstSeenTimestamp: FIRST_SEEN, now: NOW });
    assert.deepStrictEqual(result, { ms: FIRST_SEEN, source: 'first-seen' });
  });

  it('reports unknown when there is no evidence at all', () => {
    const result = resolveInstallDate({ fileTimes: { birthtimeMs: 0, ctimeMs: 0, mtimeMs: 0 }, now: NOW });
    assert.deepStrictEqual(result, { source: 'unknown' });
    assert.strictEqual(result.ms, undefined);
  });

  it('ignores values that are obviously broken', () => {
    const result = resolveInstallDate({ recordedTimestamp: Number.NaN, observedInstallTimestamp: NOW + 10 * FUTURE_TOLERANCE_MS, fileTimes: times, now: NOW });
    assert.deepStrictEqual(result, { ms: BIRTHTIME, source: 'file-birthtime' });
  });

  it('keeps the observed-install window small and positive', () => {
    assert.ok(OBSERVED_INSTALL_WINDOW_MS > 0);
    assert.ok(OBSERVED_INSTALL_WINDOW_MS <= 60 * 60 * 1000);
  });
});

describe('dateFormat', () => {
  it('formats dates in the fixed en-US style used by the view', () => {
    assert.strictEqual(formatInstallDate(Date.UTC(2026, 9, 9)), 'Oct 9, 2026');
    assert.strictEqual(formatInstallDate(undefined), 'Unknown');
    assert.strictEqual(formatInstallDateTime(undefined), 'Unknown');
  });

  it('labels every date source', () => {
    assert.strictEqual(getInstallDateSourceLabel('install-recorded'), 'Installed');
    assert.strictEqual(getInstallDateSourceLabel('install-observed'), 'Installed');
    assert.strictEqual(getInstallDateSourceLabel('file-birthtime'), 'Estimated');
    assert.strictEqual(getInstallDateSourceLabel('file-ctime'), 'Estimated');
    assert.strictEqual(getInstallDateSourceLabel('first-seen'), 'First seen');
    assert.strictEqual(getInstallDateSourceLabel('unknown'), 'Unknown');
  });

  it('renders a relative age', () => {
    assert.strictEqual(formatAge(NOW - 30_000, NOW), 'just now');
    assert.strictEqual(formatAge(NOW - 90_000, NOW), '2 minutes ago');
    assert.strictEqual(formatAge(NOW - 3 * 60 * 60 * 1000, NOW), '3 hours ago');
    assert.strictEqual(formatAge(NOW - 2 * 24 * 60 * 60 * 1000, NOW), '2 days ago');
    assert.strictEqual(formatAge(undefined, NOW), '');
  });
});
