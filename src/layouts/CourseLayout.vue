<script setup lang="ts">
// One course: a row that says which course it is, its tabs, and the page.
// The course's name is a line of context, not a heading: the page's header
// (PageHeader) holds the page's one h1, and the top bar the way back up
// (CourseCrumbs). The tabs keep to one row at any width: those that do not
// fit are under More at its end, each still a link, and More is marked as the
// tab chosen while the page is one of them. On a phone, where the side bar is
// the menu's drawer and the page is as narrow as a phone's, the strip scrolls
// sideways instead, and the phone's menu lists the course's tabs too
// (SideCourses).
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, provide, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { useAdministersCourse } from '@/composables/useAdministersCourse'
import { useContainerWidth } from '@/composables/useContainerWidth'
import { useMediaQuery } from '@/composables/useMediaQuery'
import AppEmpty from '@/components/AppEmpty.vue'
import { SIDEBAR_DRAWER_MAX_WIDTH } from '@/components/sidebar/frame'
import { findCourse } from '@/views/admin/components/adminShared'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { fitTabs, useCourseNav } from './courseNav'
import { COURSE_PAGE } from './coursePage'
import CourseSubTabs from './CourseSubTabs.vue'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const session = useSessionStore()
const router = useRouter()
const { t, locale } = useI18n()

watch(
  () => props.courseId,
  (id) => void course.open(id),
  { immediate: true },
)

const { tabs: visibleTabs, activeName: activeTab, active, subTabs, activeSub } = useCourseNav()

// The page's header leaves out a title that only names the tab chosen, and
// shows the grades' own tabs on their pages.
provide(COURSE_PAGE, {
  isTabName: (title) => title === t(active.value.label) || (!!activeSub.value && title === t(activeSub.value.label)),
  subNav: computed(() => (subTabs.value ? markRaw(CourseSubTabs) : null)),
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

// --- The tab strip -----------------------------------------------------------
// Its own width decides, never the window's: the side bar takes from the page.
// A copy of every tab and of More, laid out unseen, gives each one's width;
// as many tabs show as fit beside More (fitTabs). On a phone, where the side
// bar is the menu's drawer and the page is a phone's (592 px of page, as in a
// window of 640), every tab is in the strip, which scrolls sideways: the
// active one is kept in view, and each end fades while there is more beyond
// it. Never beside the docked side bar, however narrow the page: there a
// mouse with no wheel to turn sideways would never reach the strip's end, and
// the side bar does not list the tabs.
const PHONE_PAGE_MAX = 592
const GAP = 2
const nav = ref<HTMLElement | null>(null)
const measurer = ref<HTMLElement | null>(null)
const navWidth = useContainerWidth(nav)
const sideInDrawer = useMediaQuery(`(max-width: ${SIDEBAR_DRAWER_MAX_WIDTH}px)`)
const scrolls = computed(() => sideInDrawer.value && navWidth.value !== null && navWidth.value <= PHONE_PAGE_MAX)
const widths = ref<number[]>([])
const moreWidth = ref(0)
function measureTabs() {
  const el = measurer.value
  if (!el) return
  const items = [...el.children] as HTMLElement[]
  const sizes = items.map((item) => item.getBoundingClientRect().width)
  moreWidth.value = sizes.pop() ?? 0
  widths.value = sizes
}
/** How many tabs show in the strip; the rest are under More. */
const shownCount = computed(() => {
  const n = visibleTabs.value.length
  if (scrolls.value) return n
  // Unknown widths (nothing laid out yet, or no layout at all): as if every tab were narrow.
  const known = widths.value.length === n ? widths.value : visibleTabs.value.map(() => 0)
  return fitTabs(known, moreWidth.value, navWidth.value ?? Infinity, GAP)
})
const shownTabs = computed(() => visibleTabs.value.slice(0, shownCount.value))
const moreTabs = computed(() => visibleTabs.value.slice(shownCount.value))
const moreActive = computed(() => moreTabs.value.some((tab) => tab.name === activeTab.value))
const moreLabel = computed(() => {
  const current = moreTabs.value.find((tab) => tab.name === activeTab.value)
  return current ? t('layout.course.moreCurrent', { tab: t(current.label) }) : t('layout.course.more')
})
/**
 * A tab chosen in More's menu, from the keyboard or by a click on its link.
 * A click with a modifier key is the link's own (a new tab or window), and
 * the page stays; any other opens the tab here.
 */
function openMore(name: string, _item: unknown, e?: Event) {
  if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return
  e?.preventDefault()
  void router.push({ name, params: { courseId: props.courseId } })
}

// Tabs in another language, or in their own typeface once it has loaded, are another width.
watch([() => visibleTabs.value.map((tab) => tab.label).join(), locale, measurer], () => void nextTick(measureTabs), {
  flush: 'post',
  immediate: true,
})
const fonts = typeof document !== 'undefined' ? document.fonts : undefined
const onFonts = () => measureTabs()
onMounted(() => {
  fonts?.addEventListener?.('loadingdone', onFonts)
  void fonts?.ready?.then(onFonts)
})
onBeforeUnmount(() => fonts?.removeEventListener?.('loadingdone', onFonts))

const ends = reactive({ start: false, end: false })
function measureEnds() {
  const el = nav.value
  if (!el || !scrolls.value) {
    ends.start = ends.end = false
    return
  }
  const max = el.scrollWidth - el.clientWidth
  ends.start = max > 1 && el.scrollLeft > 1
  ends.end = max > 1 && el.scrollLeft < max - 1
}
function revealActive(smooth: boolean) {
  const el = nav.value
  const item = el?.querySelector<HTMLElement>('.course-tabs__item.is-active')
  if (!el || !item || !scrolls.value) return measureEnds()
  const clear = 24 // past the fade
  const left = item.offsetLeft - clear
  const right = item.offsetLeft + item.offsetWidth + clear
  let to = el.scrollLeft
  if (left < to) to = Math.max(0, left)
  else if (right > to + el.clientWidth) to = right - el.clientWidth
  if (to !== el.scrollLeft) el.scrollTo({ left: to, behavior: smooth ? 'smooth' : 'auto' })
  measureEnds()
}
watch([nav, scrolls], () => void nextTick(() => revealActive(false)), { flush: 'post' })
watch([activeTab, () => visibleTabs.value.length], () => void nextTick(() => revealActive(true)), { flush: 'post' })
watch([navWidth, locale], () => void nextTick(() => revealActive(false)), { flush: 'post' })
</script>

<template>
  <div class="course-layout">
    <AppEmpty
      v-if="adminWithoutSeat"
      page
      :title="t('layout.course.adminNoSeat.title')"
      :text="session.isAdmin ? t('layout.course.adminNoSeat.body') : t('deptAdmin.noSeat.body')"
      class="course-layout__no-seat"
    >
      <router-link :to="{ name: 'admin-course', params: { courseId } }">
        <el-button type="primary">{{ t('layout.course.adminNoSeat.action') }}</el-button>
      </router-link>
    </AppEmpty>
    <AsyncState
      v-else
      :loading="course.loading && !ready"
      :error="course.error"
      @retry="course.open(courseId, true)"
    >
      <template v-if="ready && course.course">
        <!-- Which course this is: a line of context, not a heading. -->
        <header class="course-head">
          <span class="course-head__code"
            >{{ course.course.code
            }}<template v-if="course.course.section"
              ><span class="app-sep">·</span>{{ course.course.section }}</template
            ></span
          >
          <span class="course-head__title" :title="course.course.title">{{ course.course.title }}</span>
          <span class="course-head__tags">
            <StatusTag vocab="courseStatus" :value="course.course.status" />
            <StatusTag v-if="course.role" vocab="role" :value="course.role" />
            <StatusTag
              v-if="course.membership && course.membership.status !== 'active'"
              vocab="memberStatus"
              :value="course.membership.status"
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
          </span>
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

        <div class="course-nav">
          <nav
            ref="nav"
            class="course-tabs"
            :class="{ 'is-scrolling': scrolls, 'has-more-start': ends.start, 'has-more-end': ends.end }"
            :aria-label="t('layout.course.nav')"
            @scroll.passive="measureEnds"
          >
            <router-link
              v-for="tab in shownTabs"
              :key="tab.name"
              :to="{ name: tab.name, params: { courseId } }"
              class="course-tabs__item"
              :class="{ 'is-active': activeTab === tab.name }"
              :aria-current="activeTab === tab.name ? 'page' : undefined"
            >
              <el-icon aria-hidden="true"><component :is="tab.icon" /></el-icon>
              <span>{{ t(tab.label) }}</span>
            </router-link>
            <el-dropdown
              v-if="moreTabs.length"
              trigger="click"
              placement="bottom-end"
              class="course-tabs__more-wrap"
              popper-class="course-tabs__menu"
              @command="openMore"
            >
              <button
                type="button"
                class="course-tabs__item course-tabs__more"
                :class="{ 'is-active': moreActive }"
                :aria-label="moreLabel"
              >
                <span>{{ t('layout.course.more') }}</span>
                <el-icon aria-hidden="true" class="course-tabs__caret"><ArrowDown /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <!-- Each a link, as in the strip: its address, to open in a new tab or to copy. -->
                  <el-dropdown-item
                    v-for="tab in moreTabs"
                    :key="tab.name"
                    :command="tab.name"
                    :class="{ 'is-active': activeTab === tab.name }"
                    :aria-current="activeTab === tab.name ? 'page' : undefined"
                  >
                    <router-link v-slot="{ href }" :to="{ name: tab.name, params: { courseId } }" custom>
                      <a :href="href" class="course-tabs__menu-link" tabindex="-1">
                        <el-icon aria-hidden="true"><component :is="tab.icon" /></el-icon>
                        <span>{{ t(tab.label) }}</span>
                      </a>
                    </router-link>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </nav>
          <!-- Every tab and More, laid out unseen, for their widths. -->
          <div ref="measurer" class="course-tabs__measure" aria-hidden="true" inert>
            <span v-for="tab in visibleTabs" :key="tab.name" class="course-tabs__item is-active">
              <el-icon><component :is="tab.icon" /></el-icon>
              <span>{{ t(tab.label) }}</span>
            </span>
            <span class="course-tabs__item course-tabs__more is-active">
              <span>{{ t('layout.course.more') }}</span>
              <el-icon class="course-tabs__caret"><ArrowDown /></el-icon>
            </span>
          </div>
        </div>

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
/* The course's three rows (which course, its tabs, the page's header) start 12 px under the top bar, not the
   page's 24, so that the page's own content starts within 200 px of the window's top on a laptop's screen. */
@media (min-width: 601px) {
  .course-layout {
    margin-top: -12px;
  }
}
/* Which course: its code, its name in the sans, and its status, on one line. A long name gives way, cut
   short with an ellipsis (the top bar, its title and the side bar say it in full); the code and the status
   never do. Only where the page is a phone's do they wrap, the name then on two lines at most. */
.course-head {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  column-gap: 10px;
  row-gap: 2px;
  min-height: 28px;
  margin-bottom: 6px;
}
.course-head__code {
  flex: none;
  font-size: 13px;
  font-weight: var(--app-weight-strong, 600);
  color: var(--app-indigo);
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.course-head__title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-font-sans);
  font-size: 19px;
  line-height: 28px;
  font-weight: var(--app-weight-strong, 600);
  color: var(--app-ink);
}
.course-head__tags {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
@container (max-width: 592px) {
  .course-head {
    flex-wrap: wrap;
    row-gap: 4px;
  }
  .course-head__title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
    word-break: break-word;
  }
  .course-head__tags {
    flex-wrap: wrap;
  }
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
  margin: 8px 0;
}
/* The tabs: one row, ruled under, never wrapped. */
.course-nav {
  position: relative;
  margin-bottom: 12px;
}
.course-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
  overflow: hidden;
  box-shadow: inset 0 -1px 0 var(--app-line);
  --fade: 16px;
}
/* A phone: every tab in the strip, which scrolls sideways (by touch: no bar). */
.course-tabs.is-scrolling {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.course-tabs.is-scrolling::-webkit-scrollbar {
  display: none;
}
/* More beyond an end: that end fades out, over 16 px, so that the next tab still shows. */
.course-tabs.has-more-end {
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
}
.course-tabs.has-more-start {
  -webkit-mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to left, #000 calc(100% - var(--fade)), transparent);
}
.course-tabs.has-more-start.has-more-end {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    #000 var(--fade),
    #000 calc(100% - var(--fade)),
    transparent
  );
  mask-image: linear-gradient(to right, transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
}
.course-tabs__item {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 2px 12px 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
.course-tabs__item:hover {
  color: var(--app-indigo);
}
.course-tabs__item.is-active {
  color: var(--app-indigo);
  border-bottom-color: var(--app-indigo);
  font-weight: 500;
}
/* The strip clips, and would clip a ring outside a tab: this one is inside. */
.course-tabs__item:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: -2px;
  border-radius: var(--app-radius-control);
}
.course-tabs__more-wrap {
  flex: 0 0 auto;
}
/* On a touch screen a tab, pressed as often as anything, is 44 px, as Element Plus's controls are there
   (docs/CONVENTIONS.md: a control of the app's own pressed often is at least 40 px). */
@media (pointer: coarse) {
  .course-tabs__item {
    height: 44px;
  }
}
.course-tabs__caret {
  font-size: 12px;
}
/* Every tab and More, laid out as in the strip but unseen and taking no room, not even beyond the page's
   edge (the box is empty, and clips what is in it): their widths. */
.course-tabs__measure {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}
</style>

<style>
/* More's menu: each item a link filling it; the tab chosen, if it is one of them, marked as the strip marks it. */
.course-tabs__menu .el-dropdown-menu__item {
  padding: 0;
}
.course-tabs__menu-link {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
  color: inherit;
  text-decoration: none;
}
.course-tabs__menu .el-dropdown-menu__item .el-icon {
  margin-right: 0;
}
@media (pointer: coarse) {
  .course-tabs__menu-link {
    min-height: 44px;
  }
}
.course-tabs__menu .el-dropdown-menu__item.is-active {
  color: var(--app-indigo);
  background: var(--app-indigo-tint);
  font-weight: 500;
}
</style>
