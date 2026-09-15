export function getSessionStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function readSessionValue(key: string): string | undefined {
  const storage = getSessionStorage();

  if (!storage) {
    return undefined;
  }

  try {
    return storage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeSessionValue(key: string, value: string): void {
  const storage = getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // Session storage is a convenience; server state remains authoritative.
  }
}
