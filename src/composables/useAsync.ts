import { onScopeDispose, ref, shallowRef, watch, type Ref, type WatchSource } from 'vue'
import { ApiError } from '@/api/http'

export interface AsyncState<T> {
  data: Ref<T | undefined>
  error: Ref<ApiError | null>
  loading: Ref<boolean>
  /** Runs the loader again. Resolves once it has finished, whatever came of it. */
  reload: () => Promise<void>
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  return new ApiError({ status: 0, code: 'internal', message: (e as Error)?.message ?? String(e) })
}

/**
 * Loads something and keeps its state. The loader runs at once (unless
 * immediate is false) and again whenever a watched source changes; an answer
 * that arrives after a newer load has started is dropped.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  opts: { immediate?: boolean; watch?: WatchSource<unknown>[]; keepData?: boolean } = {},
): AsyncState<T> {
  const data = shallowRef<T | undefined>(undefined) as Ref<T | undefined>
  const error = ref<ApiError | null>(null) as Ref<ApiError | null>
  const loading = ref(false)
  let generation = 0
  let disposed = false

  async function reload() {
    const mine = ++generation
    loading.value = true
    error.value = null
    if (!opts.keepData) data.value = undefined
    try {
      const v = await loader()
      if (mine === generation && !disposed) data.value = v
    } catch (e) {
      if (mine === generation && !disposed) error.value = toApiError(e)
    } finally {
      if (mine === generation && !disposed) loading.value = false
    }
  }

  if (opts.watch?.length) watch(opts.watch, () => void reload())
  if (opts.immediate !== false) void reload()
  onScopeDispose(() => {
    disposed = true
  })
  return { data, error, loading, reload }
}

export interface PagedState<T> {
  items: Ref<T[]>
  error: Ref<ApiError | null>
  loading: Ref<boolean>
  hasMore: Ref<boolean>
  loadMore: () => Promise<void>
  reload: () => Promise<void>
}

/**
 * A list Core pages with an `after` cursor: each page names the id to ask
 * after for the next one, in `next`, and names none on the last page.
 */
export function usePaged<T>(
  fetchPage: (after: string | undefined) => Promise<{ items: T[] | null | undefined; next?: string | null }>,
  opts: { immediate?: boolean; watch?: WatchSource<unknown>[] } = {},
): PagedState<T> {
  const items = ref<T[]>([]) as Ref<T[]>
  const error = ref<ApiError | null>(null) as Ref<ApiError | null>
  const loading = ref(false)
  const hasMore = ref(false)
  let next: string | undefined
  let generation = 0

  async function page(reset: boolean) {
    const mine = reset ? ++generation : generation
    loading.value = true
    error.value = null
    if (reset) {
      next = undefined
    }
    try {
      const out = await fetchPage(reset ? undefined : next)
      if (mine !== generation) return
      items.value = reset ? [...(out.items ?? [])] : [...items.value, ...(out.items ?? [])]
      next = out.next ?? undefined
      hasMore.value = !!next
    } catch (e) {
      if (mine === generation) {
        if (reset) items.value = []
        error.value = toApiError(e)
      }
    } finally {
      if (mine === generation) loading.value = false
    }
  }

  const reload = () => page(true)
  const loadMore = () => (hasMore.value && !loading.value ? page(false) : Promise.resolve())
  if (opts.watch?.length) watch(opts.watch, () => void reload())
  if (opts.immediate !== false) void reload()
  return { items, error, loading, hasMore, loadMore, reload }
}
