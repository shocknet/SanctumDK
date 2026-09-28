// Sanctum rotates refresh tokens and revokes the grant when a used one comes back,
// so tabs sharing token storage must refresh one at a time.
export async function withRefreshLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return fn();
  return locks.request(name, fn);
}
