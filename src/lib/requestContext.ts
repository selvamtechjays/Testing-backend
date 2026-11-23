import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the request id across awaits so any log line written while a request is handled can name it
// without every function passing it along (DEC-308). The store holds no data beyond the id.
const storage = new AsyncLocalStorage<string>();

/** Runs `fn` with `requestId` as the current request's id. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run(requestId, fn);
}

/** The id of the request being handled, or undefined outside a request. */
export function currentRequestId(): string | undefined {
  return storage.getStore();
}
