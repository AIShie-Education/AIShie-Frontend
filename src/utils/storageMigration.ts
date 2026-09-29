// What this browser remembers for the app, moved to the names it has now.
//
// Before the app was called AIshie, it kept what a browser remembers (the
// language, the theme, the side bar and the chat panel, the course a caller
// last asked in, and what earlier versions kept besides) under keys starting
// "aishiteru."; it keeps them under "aishie." now. Once, at start, before any
// of its code reads a key of its own (main.ts imports migrateStorage.ts
// first), each such key in localStorage and sessionStorage is moved: its
// value is copied to the new name unless something is there already, which
// is newer and wins, and the old key is deleted. A browser with no storage,
// or one that refuses it, has nothing to move.

/** How the keys of earlier versions start. Read only to move them. */
export const EARLIER_PREFIX = 'aishiteru.'
/** How every key the app keeps in this browser starts. */
export const PREFIX = 'aishie.'

/** Moves one storage's keys of earlier versions to their names now. */
export function moveEarlierKeys(storage: Storage): void {
  const earlier: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(EARLIER_PREFIX)) earlier.push(key)
  }
  for (const key of earlier) {
    try {
      const value = storage.getItem(key)
      const now = PREFIX + key.slice(EARLIER_PREFIX.length)
      if (value !== null && storage.getItem(now) === null) storage.setItem(now, value)
      storage.removeItem(key)
    } catch {
      // Not copied (the storage is full, say): the old key stays, to be moved at the next start.
    }
  }
}

/** The browser's two storages, either of which may be refused when asked for. */
export interface Storages {
  readonly localStorage: Storage
  readonly sessionStorage: Storage
}

/** Moves the keys of earlier versions in both storages, whatever either does. */
export function migrateStorage(from: Storages = window): void {
  for (const which of ['localStorage', 'sessionStorage'] as const) {
    try {
      moveEarlierKeys(from[which])
    } catch {
      // No storage here (a sandboxed frame, site data blocked): nothing to move.
    }
  }
}
