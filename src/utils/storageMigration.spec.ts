import { beforeEach, describe, expect, it } from 'vitest'
import { initialLocale } from '@/i18n'
import { loadFrame as loadPanelFrame, loadLastCourse } from '@/components/chat/panel'
import { loadFrame as loadSideFrame } from '@/components/sidebar/frame'
import { migrateStorage, moveEarlierKeys } from './storageMigration'

// What an earlier version of the app, from before it was called AIshie, left
// in a browser: these keys are the ones being moved, and so keep their names.
const EARLIER_LOCAL: Record<string, string> = {
  'aishiteru.locale': 'zh-Hant',
  'aishiteru.theme': 'dark',
  'aishiteru.sideBar': JSON.stringify({ open: false, view: 'admin' }),
  'aishiteru.chatPanel': JSON.stringify({ open: true, width: 480 }),
  'aishiteru.chatCourse.ada': 'k1',
  'aishiteru.chat.bo': JSON.stringify({ course: 'k2' }),
  'aishiteru.admin.recentActors.ada': '[]',
  'aishiteru.scheme.helpOpen': '0',
}
const EARLIER_SESSION: Record<string, string> = {
  'aishiteru.bearer': 'ais_abcdefghijkl_pasted-in-an-earlier-version',
  'aishiteru.chunkReload': JSON.stringify({ target: '/b/7', at: 1 }),
}

/** The same entries under the names the app has now. */
const renamed = (entries: Record<string, string>) =>
  Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.replace(/^aishiteru\./, 'aishie.'), v]))

function fill(storage: Storage, entries: Record<string, string>) {
  for (const [k, v] of Object.entries(entries)) storage.setItem(k, v)
}

function contents(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)!
    out[k] = storage.getItem(k)!
  }
  return out
}

/** A storage, over a map, that is full for the keys `full` names. */
function storageFullFor(full: (key: string) => boolean, entries: Record<string, string>) {
  const map = new Map(Object.entries(entries))
  const storage = {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  return { storage: storage as unknown as Storage, map }
}

const refused = (): never => {
  throw new DOMException('The operation is insecure.', 'SecurityError')
}

// The i18n module keeps the language it starts in as it loads: each test starts from nothing.
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('moving what earlier versions kept in this browser', () => {
  it('moves each of their keys to its name now, in both storages, and leaves anything else alone', () => {
    fill(localStorage, { ...EARLIER_LOCAL, 'another.app': 'theirs' })
    fill(sessionStorage, EARLIER_SESSION)
    migrateStorage()
    expect(contents(localStorage)).toEqual({ ...renamed(EARLIER_LOCAL), 'another.app': 'theirs' })
    expect(contents(sessionStorage)).toEqual(renamed(EARLIER_SESSION))
  })

  it('hands the app what an earlier version remembered, read under the names now', () => {
    fill(localStorage, EARLIER_LOCAL)
    migrateStorage()
    expect(initialLocale()).toBe('zh-Hant')
    expect(loadSideFrame()).toEqual({ open: false, view: 'admin' })
    // Open, as it was; the width it kept was the docked panel's, which the chat's window lets go.
    expect(loadPanelFrame()).toEqual({ open: true, box: null })
    expect(loadLastCourse('ada')).toBe('k1')
    // What the chat kept before Core kept what was read: its course is still taken once.
    expect(loadLastCourse('bo')).toBe('k2')
  })

  it('keeps what is under the name now, which is newer, and deletes the earlier key all the same', () => {
    fill(localStorage, { 'aishiteru.locale': 'zh-Hant', 'aishie.locale': 'en', 'aishiteru.theme': 'dark' })
    fill(sessionStorage, {
      'aishiteru.chunkReload': '{"target":"/a","at":1}',
      'aishie.chunkReload': '{"target":"/b","at":2}',
    })
    migrateStorage()
    expect(contents(localStorage)).toEqual({ 'aishie.locale': 'en', 'aishie.theme': 'dark' })
    expect(contents(sessionStorage)).toEqual({ 'aishie.chunkReload': '{"target":"/b","at":2}' })
  })

  it('moves once: the next start finds nothing to move, and changes nothing', () => {
    fill(localStorage, EARLIER_LOCAL)
    migrateStorage()
    localStorage.setItem('aishie.locale', 'en')
    migrateStorage()
    expect(contents(localStorage)).toEqual({ ...renamed(EARLIER_LOCAL), 'aishie.locale': 'en' })
  })

  it('does nothing, and throws nothing, where the browser refuses both storages', () => {
    expect(() =>
      migrateStorage({
        get localStorage() {
          return refused()
        },
        get sessionStorage() {
          return refused()
        },
      }),
    ).not.toThrow()
  })

  it('still moves what is in one storage when the other is refused', () => {
    fill(sessionStorage, EARLIER_SESSION)
    migrateStorage({
      get localStorage() {
        return refused()
      },
      sessionStorage,
    })
    expect(contents(sessionStorage)).toEqual(renamed(EARLIER_SESSION))
  })

  it('keeps a key it could not copy, to move at the next start, and moves the rest', () => {
    const { storage, map } = storageFullFor((k) => k === 'aishie.chatPanel', {
      'aishiteru.chatPanel': '{"open":true}',
      'aishiteru.locale': 'en',
    })
    moveEarlierKeys(storage)
    expect(Object.fromEntries(map)).toEqual({ 'aishiteru.chatPanel': '{"open":true}', 'aishie.locale': 'en' })
  })
})
