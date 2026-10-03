<script setup lang="ts">
// The side bar's courses: the caller's seats, filtered by what is typed,
// each with its code and section, title and role, and whether the seat is
// paused or the course a draft or archived; the course the page shows
// stands out, and archived courses wait behind a switch. Then, for an
// administrator, the courses they administer without a seat, newest first
// (the way in is their administration page, as on home), and a link to the
// whole list, My courses. In the phone's menu, where there is no tab strip
// beside it, the course the page is in lists its tabs under it.
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { read } from '@/api/http'
import type { Course } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useSessionStore } from '@/stores/session'
import StatusTag from '@/components/StatusTag.vue'
import { useCourseStore } from '@/stores/course'
import { useCourseNav } from '@/layouts/courseNav'
import { SIDE_IN_DRAWER } from './frame'

const { t } = useI18n()
const session = useSessionStore()
const route = useRoute()

const filter = ref('')
const showArchived = ref(false)
const query = computed(() => filter.value.trim().toLowerCase())
const matches = (c: { code: string; section: string; title: string }) =>
  !query.value || `${c.code} ${c.section} ${c.title}`.toLowerCase().includes(query.value)

/** The course the page is in, if it is one of a course's pages. */
const pageCourse = computed(() =>
  route.path.startsWith('/courses/') && typeof route.params.courseId === 'string' ? route.params.courseId : null,
)
/** In the phone's menu, the course the page is in, once read, whose tabs are listed under it. */
const inDrawer = inject(SIDE_IN_DRAWER, false)
const openCourse = useCourseStore()
const courseNav = useCourseNav()
const tabsOf = (id: string) => inDrawer && pageCourse.value === id && openCourse.courseId === id && !!openCourse.course
/**
 * How the course the page is in is marked: as the page itself on its
 * overview, the page its link leads to; on any other of its pages, and
 * wherever its tabs are listed under it (one of which is the page), as the
 * course the page is in, not the page.
 */
const courseCurrent = (id: string) =>
  pageCourse.value !== id ? undefined : route.name === 'course-overview' && !tabsOf(id) ? 'page' : 'true'
/** The course whose administration page this is. */
const adminCourse = computed(() =>
  route.name === 'admin-course' && typeof route.params.courseId === 'string' ? route.params.courseId : null,
)

const seated = computed(() =>
  session.liveMemberships
    .filter((m) => showArchived.value || m.course_status !== 'archived')
    .filter(matches)
    .sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`)),
)

// An administrator's courses without a seat, as home lists them: course.list
// gives a department's administrator only the courses they administer.
const ADMIN_LIST_LIMIT = 200
const SHOWN = 8
const administered = useAsync(
  async (): Promise<{ courses: Course[]; more: boolean }> => {
    if (!session.canAdminister) return { courses: [], more: false }
    const out = await read('course.list', { limit: ADMIN_LIST_LIMIT })
    return { courses: out.courses ?? [], more: !!out.next }
  },
  { keepData: true, immediate: false },
)
watch(
  () => session.canAdminister,
  () => void administered.reload(),
  { immediate: true },
)
const unseatedAll = computed(() => {
  const mine = new Set(session.liveMemberships.map((m) => m.course_id))
  return (administered.data.value?.courses ?? []).filter((c) => !mine.has(c.id))
})
const unseatedShown = computed(() =>
  unseatedAll.value
    .filter((c) => showArchived.value || c.status !== 'archived')
    .filter(matches)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)),
)
const unseated = computed(() => unseatedShown.value.slice(0, SHOWN))
const unseatedMore = computed(() => unseatedShown.value.length > SHOWN || !!administered.data.value?.more)

const archivedCount = computed(
  () =>
    session.liveMemberships.filter((m) => m.course_status === 'archived').length +
    unseatedAll.value.filter((c) => c.status === 'archived').length,
)
</script>

<template>
  <div class="side-courses">
    <div class="side-courses__tools">
      <el-input
        v-model="filter"
        size="small"
        clearable
        :placeholder="t('layout.side.filter')"
        :aria-label="t('layout.side.filter')"
      >
        <template #prefix>
          <el-icon aria-hidden="true"><Search /></el-icon>
        </template>
      </el-input>
      <el-checkbox v-if="archivedCount" v-model="showArchived" size="small" class="side-courses__archived">
        {{ t('layout.side.showArchived', { n: archivedCount }) }}
      </el-checkbox>
    </div>

    <nav class="side-list" :aria-label="t('layout.courses')">
      <template v-for="m in seated" :key="m.member_id">
        <router-link
          :to="{ name: 'course-overview', params: { courseId: m.course_id } }"
          class="side-item side-course"
          :class="{ 'is-active': pageCourse === m.course_id }"
          :aria-current="courseCurrent(m.course_id)"
          :title="m.title"
        >
          <span class="side-course__top">
            <span class="side-course__code"
              >{{ m.code }}<template v-if="m.section"><span class="app-sep">·</span>{{ m.section }}</template></span
            >
            <StatusTag vocab="role" :value="m.role" />
          </span>
          <span class="side-course__title">{{ m.title }}</span>
          <span v-if="m.status === 'paused' || m.course_status !== 'active'" class="side-course__flags">
            <StatusTag v-if="m.status === 'paused'" vocab="memberStatus" :value="m.status" />
            <StatusTag v-if="m.course_status !== 'active'" vocab="courseStatus" :value="m.course_status" />
          </span>
        </router-link>
        <nav
          v-if="tabsOf(m.course_id)"
          class="side-list side-course-tabs"
          :aria-label="t('layout.side.courseTabs', { course: m.section ? `${m.code} · ${m.section}` : m.code })"
        >
          <router-link
            v-for="tab in courseNav.tabs.value"
            :key="tab.name"
            :to="{ name: tab.name, params: { courseId: m.course_id } }"
            class="side-item"
            :class="{ 'is-active': courseNav.activeName.value === tab.name }"
            :aria-current="courseNav.activeName.value === tab.name ? 'page' : undefined"
          >
            <el-icon aria-hidden="true"><component :is="tab.icon" /></el-icon>
            <span>{{ t(tab.label) }}</span>
          </router-link>
        </nav>
      </template>
    </nav>
    <p v-if="!seated.length" class="side-note">
      {{ session.liveMemberships.length ? t('layout.side.noMatch') : t('layout.side.noCourses') }}
    </p>

    <div v-if="unseated.length" class="side-group">
      <h3 id="side-unseated-title" class="side-heading">{{ t('layout.side.unseated') }}</h3>
      <nav class="side-list" aria-labelledby="side-unseated-title">
        <router-link
          v-for="c in unseated"
          :key="c.id"
          :to="{ name: 'admin-course', params: { courseId: c.id } }"
          class="side-item side-course is-unseated"
          :class="{ 'is-active': adminCourse === c.id || pageCourse === c.id }"
          :aria-current="adminCourse === c.id || pageCourse === c.id ? 'page' : undefined"
          :title="c.title"
        >
          <span class="side-course__top">
            <span class="side-course__code"
              >{{ c.code }}<template v-if="c.section"><span class="app-sep">·</span>{{ c.section }}</template></span
            >
            <StatusTag v-if="c.status !== 'active'" vocab="courseStatus" :value="c.status" />
          </span>
          <span class="side-course__title">{{ c.title }}</span>
        </router-link>
      </nav>
      <router-link v-if="unseatedMore" :to="{ name: 'admin-courses' }" class="side-more">
        {{
          t('layout.side.unseatedMore', {
            n: administered.data.value?.more ? `${unseatedAll.length}+` : unseatedShown.length,
          })
        }}
      </router-link>
    </div>

    <router-link :to="{ name: 'home' }" class="side-item side-link" :class="{ 'is-active': route.name === 'home' }">
      <el-icon aria-hidden="true"><Collection /></el-icon>
      <span>{{ t('common.nav.home') }}</span>
    </router-link>
  </div>
</template>

<style scoped>
/* The tabs of the course the page is in, under it in the phone's menu, set in from its edge. */
.side-course-tabs {
  margin: 2px 0 6px 12px;
  padding-left: 8px;
  border-left: 1px solid var(--app-line);
}
.side-courses__tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 4px 8px;
}
.side-courses__archived {
  height: 24px;
  margin-right: 0;
}
.side-item.side-course {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}
.side-course__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}
.side-course__code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  letter-spacing: 0.04em;
  color: var(--el-text-color-secondary);
}
.side-course.is-active .side-course__code {
  color: var(--app-indigo);
}
.side-course__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-course__flags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
/* A course without a seat opens on its administration page: marked as the home page marks it. */
.side-course.is-unseated {
  border: 1px dashed var(--app-line-strong);
}
.side-course.is-unseated + .side-course.is-unseated {
  margin-top: 4px;
}
</style>
