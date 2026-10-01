// Files on their way to Core, a few at a time.
//
// Each file added is an item that waits its turn, uploads (uploadFile, with
// its progress, speed and time left), and ends done, failed or cancelled.
// A failed or cancelled one can be tried again, and any can be taken off the
// list. No more than `concurrency` upload at once: the rest wait, so that
// the first files are done first rather than all of them late. A file larger
// than Core takes fails at once, before it is sent, as far as Core's limit is
// known (uploadLimits, asked once when the first file is added).
//
// The files of one version of a document (`version`) are held to what a
// version holds as well: at most max_files of them, max_version_bytes all
// together. Each file is let in, in the order listed, while there is room
// for it, and one there is no room for fails before it is sent (overLimit),
// saying why; it can be tried again once another is taken off. The list can
// be put in another order (move): a version's files are in the order listed.
import { computed, markRaw, onScopeDispose, reactive, ref, toValue, type MaybeRefOrGetter } from 'vue'
import {
  isAbort,
  isFileTooLarge,
  uploadFile,
  uploadLimits,
  type UploadedFile,
  type UploadKind,
  type UploadLimits,
  type UploadOptions,
  type UploadPhase,
} from '@/api/http'

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'

export interface UploadItem {
  readonly id: number
  readonly file: File
  readonly name: string
  readonly size: number
  status: UploadStatus
  /** Where an upload is, while it uploads. */
  phase: UploadPhase | null
  loaded: number
  /** 0 to 1. */
  fraction: number
  bytesPerSecond: number | null
  secondsLeft: number | null
  /** Which try this is, from 1. */
  attempt: number
  /** Waiting to try again after a failure on the way: until when (Date.now()), or until the browser is online. */
  retrying: { at: number; offline: boolean } | null
  /** Why it failed: an ApiError, as a rule. */
  error: unknown
  /** Larger than Core takes: trying again will not help. */
  tooLarge: boolean
  /**
   * One version's files (the queue's `version`): there was no room for it,
   * by the count (files) or the size of them all (bytes). It can be tried
   * again once another is taken off.
   */
  overLimit: 'files' | 'bytes' | null
  /** Let in: counted against what a version holds, where the queue is one version's. */
  admitted: boolean
  /** The upload, once done: its token is what attaches it. */
  result: UploadedFile | null
}

export type UploadFn = (courseId: string, kind: UploadKind, file: File, opts: UploadOptions) => Promise<UploadedFile>
/** What Core takes: its limits, or the largest file alone (a number), or null where it cannot be learnt. */
export type LimitFn = (courseId: string, kind: UploadKind) => Promise<number | UploadLimits | null>

export interface UploadQueueOptions {
  courseId: MaybeRefOrGetter<string>
  kind: MaybeRefOrGetter<UploadKind>
  /** How many upload at once. */
  concurrency?: number
  /** What uploads a file: uploadFile, but for tests. */
  upload?: UploadFn
  /** What says what Core takes: uploadLimits, but for tests. */
  limit?: LimitFn
  /**
   * The files are one version's of a document: no more of them than a
   * version holds (max_files), and no more than it holds all together
   * (max_version_bytes).
   */
  version?: boolean
  onStart?: (item: UploadItem) => void
  onDone?: (item: UploadItem) => void
  onFail?: (item: UploadItem) => void
}

/** How many files upload at once, by default. */
export const UPLOAD_CONCURRENCY = 3

let nextId = 0

export function createUploadQueue(opts: UploadQueueOptions) {
  const concurrency = Math.max(1, opts.concurrency ?? UPLOAD_CONCURRENCY)
  const upload = opts.upload ?? uploadFile
  const limit = opts.limit ?? uploadLimits
  const items = reactive<UploadItem[]>([])
  const controllers = new Map<number, AbortController>()
  /** The largest file Core takes, once known; null while unknown, or where it cannot be learnt. */
  const maxBytes = ref<number | null>(null)
  /** For one version's files: how many a version holds, once known. */
  const maxFiles = ref<number | null>(null)
  /** For one version's files: how much they may come to together, once known. */
  const maxVersionBytes = ref<number | null>(null)
  // Whose limit is known (course and kind), and whose is being asked for.
  let limitFor: string | null = null
  let limitAsking: string | null = null

  const find = (id: number) => items.find((i) => i.id === id)
  const target = () => ({ courseId: toValue(opts.courseId), kind: toValue(opts.kind) })
  const running = () => items.filter((i) => i.status === 'uploading').length

  /** Counted against what a version holds: let in, and not failed or cancelled. */
  const holds = (i: UploadItem) =>
    i.admitted && (i.status === 'queued' || i.status === 'uploading' || i.status === 'done')

  function refuse(item: UploadItem, why: { tooLarge?: boolean; overLimit?: 'files' | 'bytes' }) {
    item.status = 'failed'
    item.tooLarge = !!why.tooLarge
    item.overLimit = why.overLimit ?? null
    item.admitted = false
    item.error = null
    opts.onFail?.(item)
  }

  /**
   * Lets a file in, where what Core takes has room for it: no larger than a
   * file may be, and, for one version's files, no more files than a version
   * holds, and no more than it holds together, with those let in before it.
   * One there is no room for fails, saying why, before it is sent.
   */
  function admit(item: UploadItem): boolean {
    if (maxBytes.value && item.size > maxBytes.value) {
      refuse(item, { tooLarge: true })
      return false
    }
    if (opts.version) {
      const others = items.filter((i) => i !== item && holds(i))
      if (maxFiles.value && others.length >= maxFiles.value) {
        refuse(item, { overLimit: 'files' })
        return false
      }
      const bytes = others.reduce((sum, i) => sum + i.size, 0)
      if (maxVersionBytes.value && bytes + item.size > maxVersionBytes.value) {
        refuse(item, { overLimit: 'bytes' })
        return false
      }
    }
    item.admitted = true
    return true
  }

  /** Takes what Core takes, from what it answered, or from a refusal that named a limit. */
  function learn(l: number | Partial<UploadLimits> | null) {
    if (typeof l === 'number') {
      maxBytes.value = l > 0 ? l : null
      return
    }
    if (!l) return
    if (l.maxBytes) maxBytes.value = l.maxBytes
    if (l.maxFiles) maxFiles.value = l.maxFiles
    if (l.maxVersionBytes) maxVersionBytes.value = l.maxVersionBytes
  }

  /** Asks for the limit, once for each course and kind, and holds the queue until it is known. */
  function learnLimit(): boolean {
    const { courseId, kind } = target()
    const key = `${courseId}\u0000${kind}`
    if (limitFor === key) return true
    if (limitAsking === key) return false
    limitAsking = key
    void limit(courseId, kind)
      .catch(() => null)
      .then((l) => {
        if (limitAsking !== key) return
        limitAsking = null
        limitFor = key
        maxBytes.value = null
        maxFiles.value = null
        maxVersionBytes.value = null
        learn(l)
        pump()
      })
    return false
  }

  function pump() {
    if (!learnLimit()) return
    // Every file waiting is let in, or not, in the order listed, before any starts.
    for (const item of items) if (item.status === 'queued' && !item.admitted) admit(item)
    for (const item of items) {
      if (running() >= concurrency) return
      if (item.status === 'queued' && item.admitted) void run(item)
    }
  }

  async function run(item: UploadItem) {
    const ctrl = new AbortController()
    controllers.set(item.id, ctrl)
    Object.assign(item, {
      status: 'uploading',
      phase: 'preparing',
      loaded: 0,
      fraction: 0,
      bytesPerSecond: null,
      secondsLeft: null,
      attempt: 1,
      retrying: null,
      error: null,
    })
    opts.onStart?.(item)
    const { courseId, kind } = target()
    try {
      const result = await upload(courseId, kind, item.file, {
        signal: ctrl.signal,
        maxBytes: maxBytes.value,
        onProgress: (p) => {
          if (ctrl.signal.aborted) return
          item.phase = p.phase
          item.loaded = p.loaded
          item.fraction = p.fraction
          item.bytesPerSecond = p.bytesPerSecond
          item.secondsLeft = p.secondsLeft
          item.attempt = p.attempt
          item.retrying = null
        },
        onRetry: (r) => {
          if (ctrl.signal.aborted) return
          item.attempt = r.attempt
          item.retrying = { at: Date.now() + r.delayMs, offline: r.offline }
          item.bytesPerSecond = null
          item.secondsLeft = null
        },
      })
      if (ctrl.signal.aborted) return
      Object.assign(item, { status: 'done', phase: null, result, loaded: item.size, fraction: 1, retrying: null })
      item.bytesPerSecond = null
      item.secondsLeft = null
      opts.onDone?.(item)
    } catch (e) {
      // Cancelled or taken off: cancel() and remove() have said so already.
      if (ctrl.signal.aborted || isAbort(e)) return
      Object.assign(item, { status: 'failed', phase: null, retrying: null, error: e, tooLarge: isFileTooLarge(e) })
      item.bytesPerSecond = null
      item.secondsLeft = null
      opts.onFail?.(item)
    } finally {
      if (controllers.get(item.id) === ctrl) controllers.delete(item.id)
      pump()
    }
  }

  /** Adds files to the end of the queue, and starts what may start. Returns their items. */
  function add(files: Iterable<File>): UploadItem[] {
    const added: UploadItem[] = []
    for (const file of files) {
      items.push({
        id: ++nextId,
        file: markRaw(file),
        name: file.name,
        size: file.size,
        status: 'queued',
        phase: null,
        loaded: 0,
        fraction: 0,
        bytesPerSecond: null,
        secondsLeft: null,
        attempt: 0,
        retrying: null,
        error: null,
        tooLarge: false,
        overLimit: null,
        admitted: false,
        result: null,
      })
      // What is read back is the reactive item, which the list shows.
      added.push(items[items.length - 1]!)
    }
    pump()
    return added
  }

  /** Stops an upload, or keeps a waiting one from starting. It can be tried again. */
  function cancel(id: number) {
    const item = find(id)
    if (!item || (item.status !== 'queued' && item.status !== 'uploading')) return
    item.status = 'cancelled'
    item.phase = null
    item.retrying = null
    item.bytesPerSecond = null
    item.secondsLeft = null
    controllers.get(id)?.abort()
    controllers.delete(id)
    pump()
  }

  /**
   * Puts a failed or cancelled upload back in the queue, from the start: let
   * in again where there is room for it now. A file too large stays failed.
   */
  function retry(id: number) {
    const item = find(id)
    if (!item || (item.status !== 'failed' && item.status !== 'cancelled') || item.tooLarge) return
    Object.assign(item, {
      status: 'queued',
      error: null,
      loaded: 0,
      fraction: 0,
      attempt: 0,
      retrying: null,
      overLimit: null,
      admitted: false,
    })
    pump()
  }

  /** Moves an item to another place in the list (0 is the first): a version's files are in the order listed. */
  function move(id: number, to: number) {
    const from = items.findIndex((x) => x.id === id)
    if (from < 0) return
    const place = Math.max(0, Math.min(items.length - 1, to))
    if (place === from) return
    const [item] = items.splice(from, 1)
    items.splice(place, 0, item!)
  }

  /**
   * Marks an uploaded item failed after the fact: where it was to be
   * attached, Core refused its upload (deleted as too large, never received,
   * or no longer to be attached), with that refusal as its error. It can be
   * tried again, from the start at a fresh URL, unless it is too large.
   */
  function fail(id: number, error: unknown) {
    const item = find(id)
    if (!item || item.status !== 'done') return
    Object.assign(item, {
      status: 'failed',
      phase: null,
      result: null,
      loaded: 0,
      fraction: 0,
      retrying: null,
      error,
      tooLarge: isFileTooLarge(error),
      overLimit: null,
      admitted: false,
    })
    opts.onFail?.(item)
  }

  /** Takes an item off the list, stopping its upload if it is on its way. */
  function remove(id: number) {
    const i = items.findIndex((x) => x.id === id)
    if (i < 0) return
    controllers.get(id)?.abort()
    controllers.delete(id)
    items.splice(i, 1)
    pump()
  }

  /** Stops every upload and empties the list. */
  function clear() {
    for (const c of controllers.values()) c.abort()
    controllers.clear()
    items.splice(0, items.length)
  }

  /** Whether anything is still to upload or uploading. */
  const busy = computed(() => items.some((i) => i.status === 'queued' || i.status === 'uploading'))
  /** What is done, in the order listed. */
  const done = computed(() => items.filter((i) => i.status === 'done'))

  /**
   * One version's files that are more than a version holds, by what was
   * learnt after they were let in (a refusal that named a smaller limit):
   * how many too many, and how much they come to; null while they fit.
   */
  const excess = computed<{ files: number; bytes: number } | null>(() => {
    if (!opts.version) return null
    const held = items.filter(holds)
    const files = maxFiles.value ? Math.max(0, held.length - maxFiles.value) : 0
    const total = held.reduce((sum, i) => sum + i.size, 0)
    const over = !!maxVersionBytes.value && total > maxVersionBytes.value
    return files || over ? { files, bytes: total } : null
  })

  return {
    items,
    maxBytes,
    maxFiles,
    maxVersionBytes,
    version: !!opts.version,
    busy,
    done,
    excess,
    add,
    cancel,
    retry,
    fail,
    remove,
    move,
    learn,
    clear,
    find,
  }
}

export type UploadQueue = ReturnType<typeof createUploadQueue>

/** An upload queue that stops what is still uploading when the component goes. */
export function useUploadQueue(opts: UploadQueueOptions): UploadQueue {
  const queue = createUploadQueue(opts)
  onScopeDispose(() => queue.clear())
  return queue
}
