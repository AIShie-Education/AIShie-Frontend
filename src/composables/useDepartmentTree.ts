// The departments as a tree, with what the caller may do with each
// (department.list_tree), read once and shared by every page that names or
// chooses a department. Pages that change the tree read it again (reload).
//
// It is the caller's: what it holds is kept with whom it was read for, and
// is not given to anyone else who signs in on this page (and the next
// sign-in after another caller loads the page afresh anyway; see
// stores/session.ts).
import { computed, ref, shallowRef } from 'vue'
import { read } from '@/api/http'
import type { DepartmentNode, ToolOut } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import type { ApiError } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import {
  DEFAULT_MAX_DEPTH,
  administeredList,
  administeredRoots,
  courseDestinations,
  destinationsFor as destinationsIn,
  indexTree,
  pathLabel as pathLabelIn,
  pathOf as pathOfIn,
  childrenOf,
} from '@/utils/departmentTree'

type TreeOut = ToolOut<'department.list_tree'>

const held = shallowRef<{ forId: string; out: TreeOut } | null>(null)
const error = ref<ApiError | null>(null)
const loading = ref(false)
let inFlight: Promise<void> | null = null
let inFlightFor: string | null = null

/** Drops what is held, so that the next page to ask reads the tree again. */
export function forgetDepartmentTree() {
  held.value = null
  error.value = null
  inFlight = null
  inFlightFor = null
}

export function useDepartmentTree(opts: { immediate?: boolean } = {}) {
  const session = useSessionStore()
  const callerId = computed(() => session.me?.id ?? null)
  const out = computed(() => (held.value && held.value.forId === callerId.value ? held.value.out : null))
  const tree = computed(() => indexTree(out.value?.departments))
  const nodes = computed(() => tree.value.nodes)
  const byId = computed(() => tree.value.byId)
  const maxDepth = computed(() => out.value?.max_depth || DEFAULT_MAX_DEPTH)
  /** The departments the caller administers (all, for a platform administrator). */
  const administered = computed(() => nodes.value.filter((n) => n.administers))
  /** Those they may rename, move and staff: strictly beneath an appointment of theirs, or any for a platform administrator. */
  const manageable = computed(() => nodes.value.filter((n) => n.manages))
  /** Where what they administer begins. */
  const roots = computed(() => administeredRoots(tree.value))
  /** What they administer, in the tree's order, with an indent for each. */
  const administeredOptions = computed(() => administeredList(tree.value))
  const loaded = computed(() => !!out.value)

  /** Reads the tree again; resolves once it is in, or has failed (see error). */
  function reload(): Promise<void> {
    const forId = callerId.value
    if (!forId) return Promise.resolve()
    if (inFlight && inFlightFor === forId) return inFlight
    loading.value = true
    error.value = null
    const p = read('department.list_tree', {})
      .then((o) => {
        if (inFlight !== p) return
        held.value = { forId, out: o }
      })
      .catch((e) => {
        if (inFlight !== p) return
        error.value = toApiError(e)
      })
      .finally(() => {
        if (inFlight !== p) return
        inFlight = null
        inFlightFor = null
        loading.value = false
      })
    inFlight = p
    inFlightFor = forId
    return p
  }

  /** Reads the tree unless it is held already, or being read. */
  function ensure(): Promise<void> {
    if (out.value) return Promise.resolve()
    if (inFlight && inFlightFor === callerId.value) return inFlight
    return reload()
  }

  if (opts.immediate !== false) void ensure()

  return {
    tree,
    nodes,
    byId,
    maxDepth,
    administered,
    manageable,
    roots,
    administeredOptions,
    loaded,
    loading,
    error,
    reload,
    ensure,
    children: (id: string | null): DepartmentNode[] => childrenOf(tree.value, id),
    pathOf: (id: string) => pathOfIn(tree.value, id),
    pathLabel: (id: string, sep?: string) => pathLabelIn(tree.value, id, sep),
    destinationsFor: (deptId: string, topLabel: string) =>
      destinationsIn(tree.value, deptId, { platform: session.isAdmin, maxDepth: maxDepth.value, topLabel }),
    courseDestinations: (deptId: string) => courseDestinations(tree.value, deptId),
  }
}
