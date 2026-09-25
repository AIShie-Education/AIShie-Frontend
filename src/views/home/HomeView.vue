<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { Course } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { useAsync } from '@/composables/useAsync'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'

const { t } = useI18n()
const session = useSessionStore()
const filter = ref('')
const showArchived = ref(false)

// Seats change while the app is open (someone adds you to a course): read
// them afresh whenever this page is shown.
const state = useAsync(() => session.loadMemberships())

const courses = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return session.liveMemberships
    .filter((m) => showArchived.value || m.course_status !== 'archived')
    .filter((m) => !q || `${m.code} ${m.section} ${m.title}`.toLowerCase().includes(q))
    .sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`))
})
const hasArchived = computed(() => session.liveMemberships.some((m) => m.course_status === 'archived'))

// An administrator creates courses without joining them, and a platform role
// opens no course: what anyone sees inside one comes from their seat in it.
// So the courses an administrator has no seat in are listed apart, each with
// the way in — seating its instructor, or themselves, on its admin page.
// Whether a course already has an instructor cannot be known without a seat
// in it, so each is offered as "manage", not as "seat an instructor". The
// newest come first — the one just created is the one most likely wanted —
// and the rest are in Administration, which lists and filters them all.
const ADMIN_LIST_LIMIT = 200
const SHOWN = 12
const platformCourses = useAsync(
  async (): Promise<{ courses: Course[]; more: boolean; terms: Map<string, string> }> => {
    if (!session.isAdmin) return { courses: [], more: false, terms: new Map() }
    const [out, terms] = await Promise.all([
      read('course.list', { limit: ADMIN_LIST_LIMIT }),
      read('term.list', {}).catch(() => ({ terms: [] })),
    ])
    return {
      courses: out.courses ?? [],
      more: !!out.next,
      terms: new Map((terms.terms ?? []).map((term) => [term.id, term.name])),
    }
  },
  { keepData: true },
)
const unseatedAll = computed(() => {
  const seated = new Set(session.liveMemberships.map((m) => m.course_id))
  const q = filter.value.trim().toLowerCase()
  return (platformCourses.data.value?.courses ?? [])
    .filter((c) => !seated.has(c.id))
    .filter((c) => showArchived.value || c.status !== 'archived')
    .filter((c) => !q || `${c.code} ${c.section} ${c.title}`.toLowerCase().includes(q))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
})
const unseated = computed(() => unseatedAll.value.slice(0, SHOWN))
const unseatedMore = computed(() => unseatedAll.value.length > SHOWN || !!platformCourses.data.value?.more)
const termName = (id: string) => platformCourses.data.value?.terms.get(id) ?? ''
</script>

<template>
  <div>
    <PageHeader :title="t('home.greeting', { name: session.me?.display_name ?? '' })" :subtitle="t('home.subtitle')">
      <el-input v-model="filter" :placeholder="t('home.filterPlaceholder')" clearable style="width: 220px">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-checkbox v-if="hasArchived" v-model="showArchived" :label="t('home.showArchived')" border />
    </PageHeader>

    <AsyncState
      :loading="state.loading.value && !session.memberships.length"
      :error="session.memberships.length ? null : state.error.value"
      :empty="!courses.length && !unseated.length"
      :empty-text="session.isAdmin ? t('home.noCoursesAdmin') : t('home.noCourses')"
      @retry="state.reload"
    >
      <template #empty>
        <router-link v-if="session.isAdmin && !unseated.length" :to="{ name: 'admin-courses' }">
          <el-button type="primary">{{ t('home.goAdmin') }}</el-button>
        </router-link>
      </template>
      <!-- With courses to show below, "no seat yet" is a line, not a whole page. -->
      <p v-if="!courses.length" class="home-none">{{ t('home.noCourses') }}</p>
      <div v-else class="app-grid">
        <router-link
          v-for="m in courses"
          :key="m.member_id"
          :to="{ name: 'course-overview', params: { courseId: m.course_id } }"
          class="course-card"
        >
          <div class="course-card__top">
            <span class="course-card__code">{{ m.code }}<template v-if="m.section"> · {{ m.section }}</template></span>
            <div class="course-card__tags">
              <StatusTag v-if="m.course_status !== 'active'" vocab="courseStatus" :value="m.course_status" />
              <StatusTag v-if="m.status !== 'active'" vocab="memberStatus" :value="m.status" />
            </div>
          </div>
          <h3 class="course-card__title">{{ m.title }}</h3>
          <div class="course-card__meta">
            <StatusTag vocab="role" :value="m.role" />
            <span v-if="m.expires_at" class="app-muted">
              {{ t('home.expires', { t: '' }) }}<TimeText :value="m.expires_at" relative />
            </span>
          </div>
        </router-link>
      </div>
    </AsyncState>

    <section v-if="session.isAdmin && unseated.length" class="home-unseated" aria-labelledby="home-unseated-title">
      <h2 id="home-unseated-title" class="home-unseated__title">{{ t('home.unseated.title') }}</h2>
      <p class="home-unseated__explain">{{ t('home.unseated.explain') }}</p>
      <div class="app-grid">
        <router-link
          v-for="c in unseated"
          :key="c.id"
          :to="{ name: 'admin-course', params: { courseId: c.id } }"
          class="course-card course-card--unseated"
        >
          <div class="course-card__top">
            <span class="course-card__code">{{ c.code }}<template v-if="c.section"> · {{ c.section }}</template></span>
            <div class="course-card__tags">
              <StatusTag vocab="courseStatus" :value="c.status" />
            </div>
          </div>
          <h3 class="course-card__title">{{ c.title }}</h3>
          <div class="course-card__meta">
            <span v-if="termName(c.term_id)" class="app-muted">{{ termName(c.term_id) }}</span>
          </div>
          <div class="course-card__meta course-card__cta">
            <el-icon aria-hidden="true"><Setting /></el-icon>
            <span>{{ t('home.unseated.manage') }}</span>
          </div>
        </router-link>
      </div>
      <router-link v-if="unseatedMore" :to="{ name: 'admin-courses' }" class="home-unseated__more">
        {{ t('home.unseated.more', { n: platformCourses.data.value?.more ? `${unseatedAll.length}+` : unseatedAll.length }) }}
      </router-link>
    </section>
  </div>
</template>

<style scoped>
.home-none {
  margin: 0;
  color: var(--el-text-color-secondary);
}
.home-unseated {
  margin-top: 32px;
}
.home-unseated__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.home-unseated__explain {
  margin: 6px 0 16px;
  max-width: 72ch;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.home-unseated__more {
  display: inline-block;
  margin-top: 12px;
  font-size: 13px;
}
.course-card--unseated {
  border-style: dashed;
}
.course-card__cta {
  color: var(--el-color-primary);
  font-weight: 500;
}
.course-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}
.course-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: var(--el-box-shadow-light);
  transform: translateY(-1px);
}
.course-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.course-card__code {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.course-card__tags {
  display: flex;
  gap: 4px;
}
.course-card__title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
}
.course-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
</style>
