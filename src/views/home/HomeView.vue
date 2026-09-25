<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
      :empty="!courses.length"
      :empty-text="session.isAdmin ? t('home.noCoursesAdmin') : t('home.noCourses')"
      @retry="state.reload"
    >
      <template #empty>
        <router-link v-if="session.isAdmin" :to="{ name: 'admin-courses' }">
          <el-button type="primary">{{ t('home.goAdmin') }}</el-button>
        </router-link>
      </template>
      <div class="app-grid">
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
  </div>
</template>

<style scoped>
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
