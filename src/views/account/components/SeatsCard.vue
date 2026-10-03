<script setup lang="ts">
// The caller's seats (me.memberships), one per course.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import type { Membership } from '@/api/types'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'

const props = defineProps<{ seats: Membership[]; loading: boolean; error: ApiError | null }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()

const rows = computed(() =>
  [...props.seats].sort((a, b) => `${a.code}${a.section}`.localeCompare(`${b.code}${b.section}`)),
)
</script>

<template>
  <section class="app-card seats-card">
    <h2 class="app-card__title">
      <span>{{ t('account.seats.title') }}</span>
      <span v-if="rows.length" class="seats-card__count">{{ t('account.seats.summary', rows.length) }}</span>
    </h2>
    <p class="app-form-hint seats-card__hint">{{ t('account.seats.hint') }}</p>
    <AsyncState :loading="loading && !rows.length" :error="rows.length ? null : error" @retry="emit('retry')">
      <p v-if="!rows.length" class="app-muted seats-card__empty">{{ t('account.seats.empty') }}</p>
      <ul v-else class="seats-list">
        <li v-for="s in rows" :key="s.member_id" class="seat">
          <router-link :to="{ name: 'course-overview', params: { courseId: s.course_id } }" class="seat__course">
            <span class="seat__code"
              >{{ s.code }}<template v-if="s.section"><span class="app-sep">·</span>{{ s.section }}</template></span
            >
            <span class="seat__title">{{ s.title }}</span>
          </router-link>
          <div class="seat__tags">
            <StatusTag vocab="role" :value="s.role" />
            <StatusTag vocab="memberStatus" :value="s.status" />
            <StatusTag v-if="s.course_status !== 'active'" vocab="courseStatus" :value="s.course_status" />
          </div>
          <div class="seat__meta">
            <span>{{ t('account.seats.students', { scope: t(`enums.scope.${s.student_scope}`) }) }}</span>
            <span>{{ t('account.seats.assignments', { scope: t(`enums.scope.${s.assignment_scope}`) }) }}</span>
            <span>
              <span class="seat__k">{{ t('account.seats.expires') }}</span>
              <TimeText v-if="s.expires_at" :value="s.expires_at" cutoff />
              <template v-else>{{ t('account.seats.noExpiry') }}</template>
            </span>
            <!-- A seat's id is for those who manage a course, not on a student's seat. -->
            <span v-if="s.role !== 'student'" class="seat__id">
              <span class="seat__k">{{ t('account.seats.memberId') }}</span>
              <IdText :id="s.member_id" />
            </span>
          </div>
        </li>
      </ul>
    </AsyncState>
  </section>
</template>

<style scoped>
.seats-card__count {
  font-size: var(--app-text-sm);
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.seats-card__hint {
  margin: -6px 0 12px;
}
.seats-card__empty {
  margin: 0;
  padding: 8px 0;
}
.seats-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.seat {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'course tags'
    'meta meta';
  gap: 6px 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.seat:first-child {
  padding-top: 0;
}
.seat:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.seat__course {
  grid-area: course;
  display: flex;
  flex-direction: column;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}
.seat__course:hover .seat__title {
  color: var(--el-color-primary);
}
.seat__code {
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  color: var(--el-color-primary);
}
.seat__title {
  font-weight: 500;
  word-break: break-word;
}
.seat__tags {
  grid-area: tags;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: flex-start;
}
.seat__meta {
  grid-area: meta;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-regular);
}
.seat__k {
  color: var(--el-text-color-secondary);
  margin-right: 4px;
}
.seat__id {
  display: inline-flex;
  align-items: center;
}
@media (max-width: 480px) {
  .seat {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'course'
      'tags'
      'meta';
  }
  .seat__tags {
    justify-content: flex-start;
  }
}
</style>
