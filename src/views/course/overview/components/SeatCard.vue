<script setup lang="ts">
// The caller's seat in the course: roster role, status, the member id that is
// its stable handle, how far its reach goes (student and assignment scope),
// and when it ends. What me.memberships says is always there; the seat's own
// details (who and what is listed on it, when it was made) only where the
// seat may read the member list, which the course store has tried.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import IdText from '@/components/IdText.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const { t } = useI18n()

const m = computed(() => course.membership)
const seat = computed(() => (course.seat && course.seat.id === m.value?.member_id ? course.seat : null))
const expired = computed(() => !!m.value?.expires_at && new Date(m.value.expires_at).getTime() <= Date.now())

onMounted(() => {
  if (seat.value?.listed_assignments?.length) void course.ensureAssignments()
})

const SHOW = 6
const listedStudents = computed(() => seat.value?.listed_students ?? [])
const listedAssignments = computed(() => seat.value?.listed_assignments ?? [])

/** The words for a scope, as far as the seat's details are known. */
function scopeText(which: 'student' | 'assignment'): string {
  const scope = which === 'student' ? m.value?.student_scope : m.value?.assignment_scope
  if (scope === 'all') return t(`overview.seat.${which}All`)
  if (!seat.value) {
    return which === 'student' && m.value?.role === 'student'
      ? t('overview.seat.studentListedSelf')
      : t('overview.seat.listedUnknown')
  }
  const list = which === 'student' ? listedStudents.value : listedAssignments.value
  if (!list.length) return t('overview.seat.listedNone')
  if (which === 'student' && list.length === 1 && list[0] === m.value?.member_id) return t('overview.seat.onlyYou')
  return t('overview.seat.listedCount', { n: list.length })
}
</script>

<template>
  <section class="app-card seat">
    <h2 class="app-card__title">{{ t('overview.seat.title') }}</h2>

    <el-empty v-if="!m" :image-size="64" :description="t('overview.seat.none')" />

    <dl v-else class="seat__list">
      <div class="seat__row">
        <dt>{{ t('common.labels.role') }}</dt>
        <dd class="seat__tags">
          <StatusTag vocab="role" :value="m.role" />
          <StatusTag v-if="seat" vocab="actorKind" :value="seat.kind" />
        </dd>
      </div>
      <div class="seat__row">
        <dt>{{ t('common.labels.status') }}</dt>
        <dd>
          <StatusTag vocab="memberStatus" :value="m.status" />
          <p v-if="m.status === 'paused'" class="app-form-hint">{{ t('overview.seat.pausedHelp') }}</p>
        </dd>
      </div>
      <!-- An id is for those who manage the course, not for a student's own page. -->
      <div v-if="m.role !== 'student'" class="seat__row seat__row--block">
        <dt>{{ t('overview.seat.memberId') }}</dt>
        <dd>
          <IdText :id="m.member_id" full />
          <p class="app-form-hint">{{ t('overview.seat.memberIdHelp') }}</p>
        </dd>
      </div>
      <div class="seat__row">
        <dt>{{ t('overview.seat.students') }}</dt>
        <dd>
          <span>{{ scopeText('student') }}</span>
          <ul
            v-if="
              m.student_scope === 'listed' &&
              listedStudents.length &&
              !(listedStudents.length === 1 && listedStudents[0] === m.member_id)
            "
            class="seat__listed"
          >
            <li v-for="id in listedStudents.slice(0, SHOW)" :key="id"><MemberName :id="id" show-kind /></li>
            <li v-if="listedStudents.length > SHOW" class="app-muted">
              {{ t('overview.seat.andMore', { n: listedStudents.length - SHOW }) }}
            </li>
          </ul>
        </dd>
      </div>
      <div class="seat__row">
        <dt>{{ t('overview.seat.assignments') }}</dt>
        <dd>
          <span>{{ scopeText('assignment') }}</span>
          <ul v-if="m.assignment_scope === 'listed' && listedAssignments.length" class="seat__listed">
            <li v-for="id in listedAssignments.slice(0, SHOW)" :key="id">
              <router-link :to="{ name: 'course-assignment', params: { courseId: props.courseId, assignmentId: id } }">
                {{ course.assignmentTitle(id) ?? t('overview.seat.anAssignment') }}
              </router-link>
            </li>
            <li v-if="listedAssignments.length > SHOW" class="app-muted">
              {{ t('overview.seat.andMore', { n: listedAssignments.length - SHOW }) }}
            </li>
          </ul>
        </dd>
      </div>
      <div v-if="seat" class="seat__row">
        <dt>{{ t('overview.seat.since') }}</dt>
        <dd><TimeText :value="seat.created_at" /></dd>
      </div>
      <div class="seat__row">
        <dt>{{ t('overview.seat.expires') }}</dt>
        <dd>
          <template v-if="m.expires_at">
            <TimeText :value="m.expires_at" cutoff />
            <el-tag v-if="expired" type="danger" size="small" class="seat__expired">{{
              t('overview.seat.expired')
            }}</el-tag>
          </template>
          <span v-else>{{ t('common.labels.never') }}</span>
        </dd>
      </div>
    </dl>
    <p v-if="m" class="seat__scope-help app-muted">{{ t('overview.seat.scopeHelp') }}</p>
  </section>
</template>

<style scoped>
.seat__list {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.seat__row {
  display: grid;
  grid-template-columns: minmax(96px, 36%) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 14px;
}
.seat__row:last-child {
  border-bottom: none;
}
.seat__row--block {
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}
.seat__row dt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.seat__row dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.seat__row dd :deep(.id-text) {
  max-width: 100%;
  white-space: normal;
}
.seat__row dd :deep(.id-text__code) {
  overflow-wrap: anywhere;
}
.seat__tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.seat__listed {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
.seat__expired {
  margin-left: 6px;
}
.seat__scope-help {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.5;
}
</style>
