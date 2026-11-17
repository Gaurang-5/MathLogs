// Keep login, logout, and token rotation from interleaving SecureStore writes.
let pending: Promise<unknown> = Promise.resolve();

export function withSessionStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}
