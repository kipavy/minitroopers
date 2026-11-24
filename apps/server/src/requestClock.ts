import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The app clock of the request being served, for code that renders without the Hono context (the page layout and its
 * event banner). Set by the pages middleware (app.ts); outside a request it falls back to the system clock.
 */
const store = new AsyncLocalStorage<() => number>();

export function runWithNow<T>(now: () => number, fn: () => T): T {
  return store.run(now, fn);
}

export function requestNow(): number {
  return (store.getStore() ?? Date.now)();
}
