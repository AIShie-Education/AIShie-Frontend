<script setup lang="ts">
// One course: its header, and the parts of it the caller's seat reaches.
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { courseTabClaim } from '@/composables/useCourseTab'
import { useAdministersCourse } from '@/composables/useAdministersCourse'
import { findCourse } from '@/views/admin/components/adminShared'
import type { Perm } from '@/api/types'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const session = useSessionStore()
const route = useRoute()
const { t, locale } = useI18n()

watch(
  () => props.courseId,
  (id) => void course.open(id),
  { immediate: true },
)

interface Tab {
  name: string
  label: string
  icon: string
  /** Offered when the seat holds any of these (or when that cannot be known). */
  perms?: Perm[]
  /** Route names that count as this tab. */
  also?: string[]
}
// In the order most used; on a phone the strip scrolls, and what is at its
// end is furthest away.
const tabs: Tab[] = [
  { name: 'course-overview', label: 'layout.course.overview', icon: 'Odometer' },
  { name: 'course-materials', label: 'layout.course.materials', icon: 'Reading', perms: ['document_read'], also: ['course-document'] },
  { name: 'course-assignments', label: 'layout.course.assignments', icon: 'EditPen', perms: ['document_read'], also: ['course-assignment'] },
  { name: 'course-submissions', label: 'layout.course.submissions', icon: 'Files', perms: ['submission_read'], also: ['course-submission'] },
  { name: 'course-grades', label: 'layout.course.grades', icon: 'Medal', perms: ['grade_read'], also: ['course-grade'] },
  { name: 'course-approvals', label: 'layout.course.approvals', icon: 'Stamp', perms: ['action_decide'], also: ['course-action'] },
  { name: 'course-members', label: 'layout.course.members', icon: 'UserFilled', perms: ['member_read', 'member_invite'], also: ['course-member'] },
  // Those who manage the members manage the agents; those who decide actions oversee what they answered.
  { name: 'course-agents', label: 'layout.course.agents', icon: 'Cpu', perms: ['member_manage', 'action_decide'] },
  { name: 'course-activity', label: 'layout.course.activity', icon: 'Bell', perms: ['document_read'] },
  { name: 'course-my-actions', label: 'layout.course.myActions', icon: 'List', perms: ['document_read'] },
  { name: 'course-gradebook', label: 'layout.course.gradebook', icon: 'Tickets', perms: ['grade_read'] },
  { name: 'course-scheme', label: 'layout.course.scheme', icon: 'Share', perms: ['grade_read'] },
]

/**
 * The approval queue is offered to whoever decides here, and to a person who
 * does not but owns an agent seated here: for them it is their own agents'
 * proposals, and says so.
 */
const agentsQueue = computed(() => !course.can('action_decide') && course.ownsAgentHere === true)
const visibleTabs = computed(() =>
  tabs
    .filter(
      (tab) =>
        !tab.perms || tab.perms.some((p) => course.can(p)) || (tab.name === 'course-approvals' && agentsQueue.value),
    )
    .map((tab) =>
      tab.name === 'course-approvals' && agentsQueue.value ? { ...tab, label: 'layout.course.agentProposals' } : tab,
    ),
)
const tabOf = (list: Tab[], routeName: string | undefined) =>
  routeName ? list.find((tab) => tab.name === routeName || tab.also?.includes(routeName)) : undefined
const activeTab = computed(() => {
  // A page may say which tab it belongs to (useCourseTab), where that tab is offered.
  const claimed = tabOf(visibleTabs.value, courseTabClaim.value?.route)
  return (claimed ?? tabOf(tabs, route.name as string | undefined))?.name ?? 'course-overview'
})

const ready = computed(() => course.courseId === props.courseId && !!course.course)

// An administrator refused a course they have no seat in has not done anything
// wrong: neither a platform role nor a department's appointment opens a
// course, a seat does. Say so, and where the seat is given, rather than only
// that they may not see it. A department's administrator is told so only of a
// course they administer, which course.list lists them; any other is refused
// as it would be anyone.
const refusedWithoutSeat = computed(
  () => !course.membership && !!course.error?.isForbidden && course.courseId === props.courseId,
)
/** The course refused is one the department administrator administers (null: not asked, or not known yet). */
const administeredHere = ref<string | null>(null)
watch(
  () => [refusedWithoutSeat.value, props.courseId, session.isAdmin, session.isDeptAdmin] as const,
  async ([refused, id, platform, deptAdmin]) => {
    administeredHere.value = null
    if (!refused || platform || !deptAdmin) return
    try {
      await findCourse(id, '')
      if (id === props.courseId) administeredHere.value = id
    } catch {
      /* not theirs, or not to be known: refused as anyone is */
    }
  },
  { immediate: true },
)
const adminWithoutSeat = computed(
  () => refusedWithoutSeat.value && (session.isAdmin || administeredHere.value === props.courseId),
)

// The way to the course's administration page, for whoever administers it.
const administers = useAdministersCourse()

// Where the tabs do not fit (a phone, or a page the side bar leaves narrow),
// they scroll sideways: the active one is kept in view, and each end fades
// while there is more beyond it. A wider page wraps them instead, so every tab
// is always in sight.
const nav = ref<HTMLElement | null>(null)
const more = reactive({ start: false, end: false })
function measure() {
  const el = nav.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  more.start = max > 1 && el.scrollLeft > 1
  more.end = max > 1 && el.scrollLeft < max - 1
}
function revealActive(smooth: boolean) {
  const el = nav.value
  const item = el?.querySelector<HTMLElement>('.course-tabs__item.is-active')
  if (!el || !item) return measure()
  const clear = 32 // past the fade
  const left = item.offsetLeft - clear
  const right = item.offsetLeft + item.offsetWidth + clear
  let to = el.scrollLeft
  if (left < to) to = Math.max(0, left)
  else if (right > to + el.clientWidth) to = right - el.clientWidth
  if (to !== el.scrollLeft) el.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' })
  measure()
}
let observer: ResizeObserver | null = null
watch(nav, (el) => {
  observer?.disconnect()
  observer = null
  if (!el) return
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure())
    observer.observe(el)
  }
  void nextTick(() => revealActive(false))
})
watch([activeTab, () => visibleTabs.value.length], () => void nextTick(() => revealActive(true)), { flush: 'post' })
// Labels in another language are another width.
watch(locale, () => void nextTick(() => revealActive(false)), { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="course-layout">
    <el-result
      v-if="adminWithoutSeat"
      icon="info"
      :title="t('layout.course.adminNoSeat.title')"
      :sub-title="session.isAdmin ? t('layout.course.adminNoSeat.body') : t('deptAdmin.noSeat.body')"
      class="course-layout__no-seat"
    >
      <template #extra>
        <router-link :to="{ name: 'admin-course', params: { courseId } }">
          <el-button type="primary">{{ t('layout.course.adminNoSeat.action') }}</el-button>
        </router-link>
      </template>
    </el-result>
    <AsyncState
      v-else
      :loading="course.loading && !ready"
      :error="course.error"
      @retry="course.open(courseId, true)"
    >
      <template v-if="ready && course.course">
        <header class="course-head">
          <div class="course-head__text">
            <div class="course-head__code">
              {{ course.course.code }}<template v-if="course.course.section"> · {{ course.course.section }}</template>
            </div>
            <h1 class="course-head__title">{{ course.course.title }}</h1>
          </div>
          <div class="course-head__tags">
            <StatusTag vocab="courseStatus" :value="course.course.status" size="default" />
            <StatusTag v-if="course.role" vocab="role" :value="course.role" size="default" />
            <StatusTag
              v-if="course.membership && course.membership.status !== 'active'"
              vocab="memberStatus"
              :value="course.membership.status"
              size="default"
            />
            <router-link
              v-if="administers"
              :to="{ name: 'admin-course', params: { courseId } }"
              class="course-head__admin"
              :aria-label="t('common.nav.admin')"
              :title="t('common.nav.admin')"
            >
              <el-icon aria-hidden="true"><Setting /></el-icon>
            </router-link>
          </div>
        </header>

        <el-alert v-if="course.archived" type="info" :closable="false" show-icon class="course-banner">
          {{ t('common.archivedCourse') }}
        </el-alert>
        <el-alert
          v-else-if="course.membership?.status === 'paused'"
          type="warning"
          :closable="false"
          show-icon
          class="course-banner"
        >
          {{ t('layout.course.paused') }}
        </el-alert>

        <nav
          ref="nav"
          class="course-tabs"
          :class="{ 'has-more-start': more.start, 'has-more-end': more.end }"
          :aria-label="t('layout.course.nav')"
          @scroll.passive="measure"
        >
          <router-link
            v-for="tab in visibleTabs"
            :key="tab.name"
            :to="{ name: tab.name, params: { courseId } }"
            class="course-tabs__item"
            :class="{ 'is-active': activeTab === tab.name }"
            :aria-current="activeTab === tab.name ? 'page' : undefined"
          >
            <el-icon aria-hidden="true"><component :is="tab.icon" /></el-icon>
            <span>{{ t(tab.label) }}</span>
          </router-link>
        </nav>

        <div class="course-body">
          <router-view :key="courseId" />
        </div>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
/* The page's own width decides how the tabs are laid out, not the window's: the side bar takes from it. */
.course-layout {
  container-type: inline-size;
}
.course-layout__no-seat :deep(.el-result__subtitle) {
  max-width: 60ch;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}
.course-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.course-head__code {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-indigo);
  letter-spacing: 0.06em;
}
.course-head__title {
  margin: 2px 0 0;
  font-size: 28px;
  line-height: 1.25;
  word-break: break-word;
}
.course-head__tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.course-head__admin {
  display: inline-flex;
  padding: 4px;
  border-radius: var(--app-radius-control);
  color: var(--el-text-color-secondary);
}
.course-head__admin:hover {
  background: var(--app-ground-2);
  color: var(--app-indigo);
}
.course-banner {
  margin-bottom: 12px;
}
.course-tabs {
  position: relative;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  border-bottom: 1px solid var(--app-line);
  margin-bottom: 20px;
  scrollbar-width: thin;
  --fade: 40px;
}
/* More beyond an end: that end fades out. */
.course-tabs.has-more-end {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
}
.course-tabs.has-more-start {
  -webkit-mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent);
}
.course-tabs.has-more-start.has-more-end {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
}
/* With room for every tab in two rows, every tab shows: they wrap onto a second row. */
@container (min-width: 720px) {
  .course-tabs {
    flex-wrap: wrap;
    overflow-x: visible;
  }
}
.course-tabs__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-size: 14px;
}
.course-tabs__item:hover {
  color: var(--app-indigo);
}
.course-tabs__item.is-active {
  color: var(--app-indigo);
  border-bottom-color: var(--app-indigo);
  font-weight: 500;
}
/* The strip scrolls, and would clip a ring outside a tab: this one is inside. */
.course-tabs__item:focus-visible {
  outline-offset: -2px;
  border-radius: var(--app-radius-control);
}
</style>
