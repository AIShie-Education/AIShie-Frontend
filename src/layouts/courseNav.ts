// A course's navigation: its tabs, which of them the caller's seat is
// offered, which one the page shown belongs to, and the grades' own tabs
// (Grades, the gradebook and the grading scheme, one tab of the course). The
// tab strip (CourseLayout), the breadcrumb in the top bar (CourseCrumbs), the
// phone's menu (SideCourses) and the page's header (PageHeader, through
// coursePage.ts) all read it here, so that they never disagree.
//
// Navigation's icons are outlined, never filled (docs/CONVENTIONS.md): a
// filled glyph in a row of outlined ones reads as chosen, or as news; the
// lint rule against filled icons in navigation (eslint.config.js) sees these.
import { computed, type Component } from 'vue'
import { useRoute, type RouteLocationRaw } from 'vue-router'
import {
  Bell,
  Clock,
  Cpu,
  DataBoard,
  DocumentChecked,
  EditPen,
  Files,
  House,
  Notebook,
  Reading,
  Tickets,
  User,
} from '@element-plus/icons-vue'
import type { Perm } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { courseTabClaim } from '@/composables/useCourseTab'

export interface CourseTab {
  name: string
  label: string
  icon: Component
  /** Offered when the seat holds any of these (or when that cannot be known). */
  perms?: Perm[]
  /** Route names that count as this tab. */
  also?: string[]
}

/** The grades' own tabs, each a page of its own, under the course's one Grades tab. */
export const GRADES_PAGES = ['course-grades', 'course-gradebook', 'course-scheme'] as const

// In the order most used: what does not fit is under More at the strip's end,
// and on a phone the strip scrolls, so what is at its end is furthest away.
// prettier-ignore
export const COURSE_TABS: CourseTab[] = [
  { name: 'course-overview', label: 'layout.course.overview', icon: House },
  { name: 'course-materials', label: 'layout.course.materials', icon: Reading, perms: ['document_read'], also: ['course-document'] },
  { name: 'course-assignments', label: 'layout.course.assignments', icon: EditPen, perms: ['document_read'], also: ['course-assignment'] },
  { name: 'course-submissions', label: 'layout.course.submissions', icon: Files, perms: ['submission_read'], also: ['course-submission'] },
  // The gradebook and the grading scheme are read with grade_read, as the grades are: tabs of the Grades tab.
  { name: 'course-grades', label: 'layout.course.grades', icon: Notebook, perms: ['grade_read'], also: ['course-grade', 'course-gradebook', 'course-scheme'] },
  { name: 'course-approvals', label: 'layout.course.approvals', icon: DocumentChecked, perms: ['action_decide'], also: ['course-action'] },
  { name: 'course-members', label: 'layout.course.members', icon: User, perms: ['member_read', 'member_invite'], also: ['course-member'] },
  // Those who manage the members manage the agents; those who decide actions oversee what they answered.
  { name: 'course-agents', label: 'layout.course.agents', icon: Cpu, perms: ['member_manage', 'action_decide'] },
  { name: 'course-activity', label: 'layout.course.activity', icon: Bell, perms: ['document_read'] },
  { name: 'course-my-actions', label: 'layout.course.myActions', icon: Clock, perms: ['document_read'] },
]

/**
 * How many of the tabs show in the strip, in order; the rest are under More,
 * at the strip's end. `widths` are the tabs' own, `more` the More button's,
 * `room` the strip's width and `gap` the space between two of them. All of
 * them show where they all fit; otherwise as many as fit beside More (at
 * least one: More alone would say nothing of where the page is). More holds
 * only what does not fit: a tab that fits is never hidden behind it.
 */
export function fitTabs(widths: number[], more: number, room: number, gap: number): number {
  const n = widths.length
  const span = (k: number) => widths.slice(0, k).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, k - 1)
  if (span(n) <= room) return n
  let k = n - 1
  while (k > 1 && span(k) + gap + more > room) k--
  return Math.max(1, k)
}

export interface CourseSubTab {
  name: (typeof GRADES_PAGES)[number]
  label: string
  icon: Component
  to: RouteLocationRaw
}

/**
 * The course's tabs as the caller's seat is offered them, the one the page
 * shown belongs to, and, on the grades' pages, the grades' own tabs.
 */
export function useCourseNav() {
  const course = useCourseStore()
  const route = useRoute()

  /**
   * The approval queue is offered to whoever decides here, and to a person
   * who does not but owns an agent seated here: for them it is their own
   * agents' proposals, and says so.
   */
  const agentsQueue = computed(() => !course.can('action_decide') && course.ownsAgentHere === true)
  const tabs = computed(() =>
    COURSE_TABS.filter(
      (tab) =>
        !tab.perms || tab.perms.some((p) => course.can(p)) || (tab.name === 'course-approvals' && agentsQueue.value),
    ).map((tab) =>
      tab.name === 'course-approvals' && agentsQueue.value ? { ...tab, label: 'layout.course.agentProposals' } : tab,
    ),
  )
  const tabOf = (list: CourseTab[], routeName: string | undefined) =>
    routeName ? list.find((tab) => tab.name === routeName || tab.also?.includes(routeName)) : undefined
  /** The name of the tab the page shown belongs to. */
  const activeName = computed(() => {
    // A page may say which tab it belongs to (useCourseTab), where that tab is offered.
    const claimed = tabOf(tabs.value, courseTabClaim.value?.route)
    return (claimed ?? tabOf(COURSE_TABS, route.name as string | undefined))?.name ?? 'course-overview'
  })
  const active = computed(
    () =>
      tabs.value.find((tab) => tab.name === activeName.value) ?? COURSE_TABS.find((t) => t.name === activeName.value)!,
  )

  const courseId = computed(() => String(route.params.courseId ?? ''))
  /** One string of the route's, or undefined. */
  const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

  /**
   * The grades' own tabs, on their three pages. The student a page is about
   * goes with the way to the other: Grades filtered to them, their gradebook.
   */
  const subTabs = computed<CourseSubTab[] | null>(() => {
    const name = route.name as string
    if (!(GRADES_PAGES as readonly string[]).includes(name)) return null
    const mine = course.role === 'student'
    const student = mine
      ? undefined
      : name === 'course-grades'
        ? one(route.query.student)
        : name === 'course-gradebook'
          ? one(route.params.studentMemberId)
          : undefined
    const params = { courseId: courseId.value }
    return [
      {
        name: 'course-grades',
        // Not "Grades" again: the tab strip and the top bar say that already.
        label: mine ? 'layout.course.myGrades' : 'layout.course.allGrades',
        icon: Notebook,
        to: { name: 'course-grades', params, query: student ? { student } : {} },
      },
      {
        name: 'course-gradebook',
        label: 'layout.course.gradebook',
        icon: Tickets,
        to: { name: 'course-gradebook', params: { ...params, studentMemberId: student } },
      },
      { name: 'course-scheme', label: 'layout.course.scheme', icon: DataBoard, to: { name: 'course-scheme', params } },
    ]
  })
  const activeSub = computed(() => subTabs.value?.find((s) => s.name === route.name) ?? null)

  return { tabs, activeName, active, subTabs, activeSub, agentsQueue }
}
