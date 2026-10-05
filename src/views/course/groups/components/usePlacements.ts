// Placing students in a set's groups by hand (group.set_members), as the
// set's page does it: from the selection and "Move to…", a row's own menu,
// or a student dropped on a group. A placement that moves anyone out of, or
// into, a group with work for an assignment of the set is refused the first
// time (group_has_work, naming each work): the page shows what will happen
// to that work (AffectsWorkDialog) and places them again, saying so
// (affects_work), only once the person agrees.
import { ref } from 'vue'
import { ElNotification } from 'element-plus'
import type { ToolOut, WriteOutcome } from '@/api/http'
import { notifyError } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { i18n } from '@/i18n'
import { formatList } from '@/utils/format'
import { GROUP_REFUSALS, type GroupSet } from './groupModel'

const t = (key: string, args?: Record<string, unknown>, n?: number) =>
  n === undefined ? i18n.global.t(key, args ?? {}) : i18n.global.t(key, args ?? {}, n)

export interface Placement {
  student_member_id: string
  /** The group to place them in; none takes them out of every group of the set. */
  group_id?: string
}

/** A work the placement would touch, as the refusal names it. */
export interface TouchedWork {
  group_id: string
  assignment_id: string
  submission_id?: string
  state: string
}

export interface PendingPlacement {
  placements: Placement[]
  work: TouchedWork[]
}

function asWork(v: unknown): TouchedWork[] {
  if (!Array.isArray(v)) return []
  return v.filter(
    (w): w is TouchedWork =>
      !!w &&
      typeof w === 'object' &&
      typeof (w as TouchedWork).group_id === 'string' &&
      typeof (w as TouchedWork).assignment_id === 'string',
  )
}

export function usePlacements(opts: {
  courseId: () => string
  set: () => GroupSet | undefined
  /** A name for a student, for what is said once they are moved. */
  nameOf: (memberId: string) => string
  /** Once it is done, or proposed: the page reads the set again. */
  done: (out: WriteOutcome<ToolOut<'group.set_members'>>) => void
}) {
  const w = useWrite('group.set_members')
  /** A placement waiting for the person to agree to what it does to work (affects_work). */
  const pending = ref<PendingPlacement | null>(null)

  function groupName(id: string | null | undefined): string {
    return opts.set()?.groups?.find((g) => g.id === id)?.name ?? ''
  }

  /** What is said once it is done: who went where. */
  function success(placements: Placement[]): string {
    const to = new Set(placements.map((p) => p.group_id ?? ''))
    const names = formatList(placements.map((p) => opts.nameOf(p.student_member_id)))
    const n = placements.length
    if (to.size === 1) {
      const [g] = [...to]
      return g ? t('groups.move.done', { names, group: groupName(g) }, n) : t('groups.move.doneOut', { names }, n)
    }
    return t('groups.move.doneMany', { n }, n)
  }

  async function place(placements: Placement[], affectsWork = false): Promise<boolean> {
    if (!placements.length) return false
    const set = opts.set()
    if (!set) return false
    const out = await w.run(
      {
        course_id: opts.courseId(),
        set_id: set.id,
        placements,
        affects_work: affectsWork || undefined,
      },
      { notify: false },
    )
    if (!out) {
      const e = w.lastError.value
      if (!affectsWork && e?.details?.reason === 'group_has_work') {
        pending.value = { placements, work: asWork(e.details.work) }
        return false
      }
      notifyError(e, undefined, { reasons: GROUP_REFUSALS })
      return false
    }
    pending.value = null
    if (out.status === 'executed' && !out.replayed && (out.result.moved?.length ?? 0) === 0) {
      announce(out, { success: t('groups.move.nothing') })
    } else {
      announce(out, { success: success(placements) })
    }
    if (out.status === 'executed') {
      const over = (out.result.over_capacity ?? []).map(groupName).filter(Boolean)
      if (over.length) {
        ElNotification({
          type: 'warning',
          title: t('groups.move.overTitle'),
          message: t('groups.move.over', { groups: formatList(over) }, over.length),
          duration: 8000,
        })
      }
    }
    opts.done(out)
    return true
  }

  /** The person agreed: placed again, saying it affects work. */
  async function confirm(): Promise<boolean> {
    const p = pending.value
    if (!p) return false
    return place(p.placements, true)
  }

  return { place, confirm, pending, busy: w.pending }
}
