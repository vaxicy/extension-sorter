/**
 * Small async helpers shared by the services.
 */

/**
 * Runs `worker` for every item with a bounded number of parallel operations.
 * Keeps the extension host responsive when a user has several hundred
 * extensions installed (each one needs a `stat` and maybe a file read).
 */
export async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array<TResult>(items.length);
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  const runners = new Array(effectiveLimit).fill(undefined).map(async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/** Never rejects: resolves to `undefined` when `promise` fails. */
export async function ignoreErrors<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch {
    return undefined;
  }
}
