<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { Course } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { useAsync } from '@/composables/useAsync'
import AppEmpty from '@/components/AppEmpty.vue'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useCourseFacts } from './courseFacts'

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
/**
 * Whether the reader's roles differ among their courses: only then does a
 * course say the reader's role in it. A tag that says Instructor on every
 * course says nothing (docs/CONVENTIONS.md, "Tags").
 */
const rolesVary = computed(() => new Set(session.liveMemberships.map((m) => m.role)).size > 1)
// Each card's term, next deadline and what waits there, read after the page is shown.
const facts = useCourseFacts(courses)

// An administrator creates courses without joining them, and neither a
// platform role nor a department's appointment opens a course: what anyone
// sees inside one comes from their seat in it.
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
    // course.list gives a department's administrator only the courses they administer.
    if (!session.canAdminister) return { courses: [], more: false, terms: new Map() }
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

// A few courses are read at a glance, and the side bar filters them too: the
// page's own filter is offered from FILTER_FROM courses on.
const FILTER_FROM = 8
const offersFilter = computed(
  () => session.liveMemberships.length + (platformCourses.data.value?.courses.length ?? 0) >= FILTER_FROM,
)
watch(offersFilter, (on) => {
  if (!on) filter.value = ''
})
</script>

<template>
  <div>
    <PageHeader :title="t('home.greeting', { name: session.me?.display_name ?? '' })" :subtitle="t('home.subtitle')">
      <el-input
        v-if="offersFilter"
        v-model="filter"
        :placeholder="t('home.filterPlaceholder')"
        clearable
        style="width: 220px"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-checkbox v-if="hasArchived" v-model="showArchived" :label="t('home.showArchived')" />
    </PageHeader>

    <AsyncState
      :loading="state.loading.value && !session.memberships.length"
      :error="session.memberships.length ? null : state.error.value"
      :empty="!courses.length && !unseated.length"
      :empty-text="session.canAdminister ? t('home.noCoursesAdmin') : t('home.noCourses')"
      empty-page
      @retry="state.reload"
    >
      <template #empty>
        <router-link v-if="session.canAdminister && !unseated.length" :to="{ name: 'admin-courses' }">
          <el-button type="primary">{{ t('home.goAdmin') }}</el-button>
        </router-link>
      </template>
      <!-- With courses to show below, "no seat yet" is a line, not a whole page. -->
      <AppEmpty v-if="!courses.length" :text="t('home.noCourses')" class="home-none" />
      <div v-else class="app-grid">
        <router-link
          v-for="m in courses"
          :key="m.member_id"
          :to="{ name: 'course-overview', params: { courseId: m.course_id } }"
          class="course-card"
        >
          <div class="course-card__top">
            <span class="course-card__code"
              >{{ m.code }}<template v-if="m.section"><span class="app-sep">·</span>{{ m.section }}</template></span
            >
            <div class="course-card__tags">
              <StatusTag v-if="m.course_status !== 'active'" vocab="courseStatus" :value="m.course_status" />
              <StatusTag v-if="m.status !== 'active'" vocab="memberStatus" :value="m.status" />
            </div>
          </div>
          <h3 class="course-card__title">{{ m.title }}</h3>
          <div class="course-card__meta">
            <StatusTag v-if="rolesVary" vocab="role" :value="m.role" />
            <span v-if="facts.get(m.course_id)?.term" class="app-muted">{{ facts.get(m.course_id)?.term }}</span>
            <span v-if="m.expires_at" class="app-muted">
              {{ t('home.expires', { t: '' }) }}<TimeText :value="m.expires_at" relative cutoff />
            </span>
          </div>
          <p v-if="facts.get(m.course_id)?.next" class="course-card__due">
            <i18n-t keypath="home.nextDue" tag="span" scope="global">
              <template #title>{{ facts.get(m.course_id)!.next!.title }}</template>
              <template #when><TimeText :value="facts.get(m.course_id)!.next!.dueAt" relative cutoff /></template>
            </i18n-t>
          </p>
          <!-- What waits for the caller here, as the course's overview says it (AttentionCard). -->
          <span v-if="(facts.get(m.course_id)?.waiting?.n ?? 0) > 0" class="course-card__waiting">
            <span class="course-card__waiting-label">
              {{
                facts.get(m.course_id)!.waiting!.agentsOnly
                  ? t('overview.attention.agentProposals')
                  : t('overview.attention.proposals')
              }}
            </span>
            <span class="course-card__waiting-count">
              {{
                facts.get(m.course_id)!.waiting!.more
                  ? t('overview.attention.atLeast', { n: facts.get(m.course_id)!.waiting!.n })
                  : facts.get(m.course_id)!.waiting!.n
              }}
            </span>
          </span>
        </router-link>
      </div>
    </AsyncState>

    <section v-if="session.canAdminister && unseated.length" class="home-unseated" aria-labelledby="home-unseated-title">
      <h2 id="home-unseated-title" class="home-unseated__title">{{ t('home.unseated.title') }}</h2>
      <p class="home-unseated__explain">
        {{ session.isAdmin ? t('home.unseated.explain') : t('deptAdmin.home.explain') }}
      </p>
      <div class="app-grid">
        <router-link
          v-for="c in unseated"
          :key="c.id"
          :to="{ name: 'admin-course', params: { courseId: c.id } }"
          class="course-card course-card--unseated"
        >
          <div class="course-card__top">
            <span class="course-card__code"
              >{{ c.code }}<template v-if="c.section"><span class="app-sep">·</span>{{ c.section }}</template></span
            >
            <div class="course-card__tags">
              <!-- Only a course that is not running says its state, as a seated course's does. -->
              <StatusTag v-if="c.status !== 'active'" vocab="courseStatus" :value="c.status" />
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
.home-unseated {
  margin-top: 32px;
}
.home-unseated__title {
  margin: 0;
  font-size: var(--app-text-xl);
}
.home-unseated__explain {
  margin: 6px 0 16px;
  max-width: var(--app-measure);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-secondary);
}
.home-unseated__more {
  display: inline-block;
  margin-top: 12px;
  font-size: var(--app-text-sm);
}
.course-card--unseated {
  border-style: dashed;
}
.course-card__cta {
  color: var(--el-color-primary);
  font-weight: 500;
}
/* A course is one thing the reader opens: a box, the one kind the home page
   keeps, its edge the site's line, 2 px corners, no ground of its own and no
   shadow; under the pointer, its edge in the control's ink. */
.course-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--app-space-xl);
  border-radius: var(--app-radius);
  border: 1px solid var(--app-line);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s;
}
.course-card:hover {
  border-color: var(--app-control-border);
}
.course-card__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
/* The course's code, as its context line writes it: no tracking, not a label over the title. */
.course-card__code {
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
  color: var(--app-indigo);
}
.course-card__tags {
  display: flex;
  gap: 4px;
}
.course-card__title {
  margin: 0;
  font-family: var(--app-font-serif);
  font-size: var(--app-text-xl);
  font-weight: var(--app-heading-weight);
  letter-spacing: var(--app-heading-tracking);
  line-height: var(--app-lh-heading);
}
.course-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--app-text-xs);
  flex-wrap: wrap;
}
.course-card__due {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
/* What waits for the reader here, as the overview's row says it: the amber
   line of what waits at its left and its figure in that amber, not an amber
   box in the box. */
.course-card__waiting {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 0 2px var(--app-space-md);
  box-shadow: inset 3px 0 0 var(--app-wait-fg);
  color: var(--app-ink);
  font-size: var(--app-text-sm);
}
.course-card__waiting-label {
  flex: 1;
  min-width: 0;
}
.course-card__waiting-count {
  font-size: var(--app-text-lg);
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
  color: var(--app-wait-fg);
}
</style>
