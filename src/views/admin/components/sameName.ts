// Who is registered under a name already, for the form that registers
// someone: two actors may share a name, and then only their IDs tell them
// apart (two agents both called "Claude", say).
//
// actor.list has no search for a whole name. It finds a piece of the name or
// of the email, oldest first, so "Ed" also finds everyone whose address is at
// an .edu, and one page of that may not reach the Ed registered last. The
// matches are therefore read page by page, the whole names picked out of
// them, up to SAME_NAME_PAGES pages; past that the answer says the check was
// not complete, and how many matches it read.
import type { ActorRow } from './adminShared'
import { listActors } from './actorSearch'

/** Core's largest page of actor.list. */
export const SAME_NAME_PAGE = 200
/** At most this many pages are read: 1000 matches. */
export const SAME_NAME_PAGES = 5

/** The same name, whatever the case and the spaces around it. */
export const sameText = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

export interface SameName {
  /** Those registered under the name, oldest first. */
  actors: ActorRow[]
  /** How many of the name's matches were read. */
  checked: number
  /** False when matches were left unread: too many, or a later page failed. */
  complete: boolean
}

/**
 * Those registered under this whole name. `found` hears who has been found so
 * far whenever a page adds someone, so that a warning can show before the last
 * page is in. Resolves to null, having stopped, once `stale()` says the name
 * has been typed over. A failure on the first page is thrown; on a later one,
 * what was found is the answer, incomplete.
 */
export async function findSameName(
  name: string,
  opts: { stale?: () => boolean; found?: (actors: ActorRow[]) => void } = {},
): Promise<SameName | null> {
  const stale = opts.stale ?? (() => false)
  const actors: ActorRow[] = []
  let checked = 0
  let after: string | undefined
  for (let i = 0; i < SAME_NAME_PAGES; i++) {
    let out: Awaited<ReturnType<typeof listActors>>
    try {
      out = await listActors({ search: name, limit: SAME_NAME_PAGE, after })
    } catch (e) {
      if (stale()) return null
      if (i === 0) throw e
      return { actors, checked, complete: false }
    }
    if (stale()) return null
    const page = out.actors ?? []
    checked += page.length
    const before = actors.length
    actors.push(...page.filter((a) => sameText(a.display_name, name)))
    if (actors.length > before) opts.found?.([...actors])
    after = out.next ?? undefined
    if (!after) break
  }
  return { actors, checked, complete: !after }
}
