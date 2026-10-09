<script setup lang="ts">
// The grades given for a group's work: the group's score, and each member's
// own grade from it, with how it was given (the group's score, a score of
// their own, plus or minus, or moved by peer evaluation), why and by whom.
// Those who grade adjust one member here (grade.adjust); a member of the
// work with no grade from it yet (one added since it was graded) is said so.
// Core gives a seat the grades only of the students it reaches: a member
// outside its reach is said to be, never to have no grade, and one it may
// not reach (where that is not known) is said to have none shown.
// A member of the group reads only their own grade, as Core gives it: never
// another member's score or adjustment.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { ApiError, ToolOut, WriteOutcome } from '@/api/http'
import type { ActionSummary, Decimal, GradeSummary, Submission } from '@/api/types'
import AppNote from '@/components/AppNote.vue'
import AsyncState from '@/components/AsyncState.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useCourseStore } from '@/stores/course'
import AdjustGradeDialog from '@/views/course/grades/components/AdjustGradeDialog.vue'
import ScoreText from '@/views/course/grades/components/ScoreText.vue'
import AdjustmentText from './AdjustmentText.vue'
import PendingGradeProposals from './PendingGradeProposals.vue'
import { isGraderAdjustment, liveByMember, workMemberIds, type WorkReach } from './groupGrading'

const props = defineProps<{
  courseId: string
  submission: Submission
  grades: GradeSummary[]
  pointsPossible?: Decimal | null
  loading?: boolean
  error?: ApiError | null
  /** The caller is a member of the work, looking at their own grade. */
  own?: boolean
  /** The caller may not read grades here: known already, so none were asked for. */
  forbidden?: boolean
  proposals?: ActionSummary[]
  liveDraft?: GradeSummary
  livePosted?: GradeSummary
  /** Whether the caller's seat reaches every member of the work (groupGrading.workReach). */
  reach?: WorkReach
}>()
const emit = defineEmits<{ retry: []; changed: [] }>()
const { t } = useI18n()
const course = useCourseStore()

const forbidden = computed(() => props.forbidden || !!props.error?.isForbidden)
const live = computed(() => liveByMember(props.grades, props.submission.id))
const nameOf = (id: string) => props.submission.members?.find((m) => m.member_id === id)?.display_name ?? null

interface Line {
  memberId: string
  name: string | null
  grade: GradeSummary | null
  /** Whether the caller's seat reaches them: their grade is read only if it does. */
  reached: boolean | null
}
/** A member's own grade is theirs to read; anyone else's, a seat reaching them all reads every one. */
const reached = (id: string): boolean | null => (props.own || props.reach === 'all' ? true : course.reachesStudent(id))
/** Every member of the work, with their live grade; then anyone graded on it who is no longer of it. */
const lines = computed<Line[]>(() => {
  const ids = workMemberIds(props.submission)
  // A member reads their own grade alone: the others' lines would say nothing true.
  const shown = props.own ? ids.filter((id) => live.value.has(id)) : ids
  const out: Line[] = shown.map((id) => ({
    memberId: id,
    name: nameOf(id),
    grade: live.value.get(id) ?? null,
    reached: reached(id),
  }))
  for (const [id, g] of live.value) {
    if (!ids.includes(id)) out.push({ memberId: id, name: nameOf(id), grade: g, reached: true })
  }
  return out
})
/** The group's grade the newest live grade was given from: its score, as the members' grades say. */
const groupNow = computed(() => {
  const gs = [...live.value.values()].filter((g) => !!g.group)
  gs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return gs[0]?.group ?? null
})
const anyDraft = computed(() => [...live.value.values()].some((g) => g.state === 'draft'))
/** A member of the work within reach with no grade from it: one added since it was graded. */
const ungraded = computed(() => lines.value.some((l) => !l.grade && l.reached === true))
const earlier = computed(() =>
  props.grades
    .filter((g) => g.state === 'superseded' || !!g.superseded_by)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)),
)
const showEarlier = ref(false)

// Adjusting one member: a draft as entering one is, a posted grade as a regrade is.
function canAdjust(g: GradeSummary | null): boolean {
  if (!g || props.own || !g.group || !course.writable) return false
  return g.state === 'posted' ? course.canAll(['grade_submit', 'grade_post']) : course.can('grade_submit')
}
function adjustNeedsApproval(g: GradeSummary): boolean {
  return g.state === 'posted'
    ? course.needsApprovalAll(['grade_submit', 'grade_post'])
    : course.needsApproval('grade_submit')
}
const adjusting = ref<{ grade: GradeSummary; name: string } | null>(null)
const adjustOpen = ref(false)
function adjust(l: Line) {
  if (!l.grade) return
  adjusting.value = {
    grade: l.grade,
    name: l.name ?? course.memberName(l.memberId) ?? t('groupGrading.editor.thisMember'),
  }
  adjustOpen.value = true
}
const proposed = ref(false)
function onAdjusted(out: WriteOutcome<ToolOut<'grade.adjust'>>) {
  if (out.status === 'proposed') {
    proposed.value = true
  } else if (!out.result.changed) {
    ElMessage({ type: 'info', message: t('groupGrading.adjust.unchanged') })
  } else {
    ElMessage({
      type: 'success',
      message:
        t('groupGrading.adjust.done') + (out.reviewState === 'pending' ? ` ${t('common.outcome.pendingReview')}` : ''),
    })
  }
  emit('changed')
}
</script>

<template>
  <section class="app-card group-grades">
    <h2 class="app-card__title">
      <span>{{ t('submissions.grades.title') }}</span>
      <router-link
        v-if="!own && !forbidden"
        class="group-grades__all"
        :to="{ name: 'course-grades', params: { courseId }, query: { assignment: submission.assignment_id } }"
      >
        {{ t('submissions.grades.allLink') }}
      </router-link>
    </h2>
    <p v-if="forbidden" class="app-muted group-grades__none">{{ t('submissions.grades.forbidden') }}</p>
    <AsyncState v-else :loading="loading && !grades.length" :error="error" @retry="emit('retry')">
      <p v-if="!live.size" class="app-muted group-grades__none">
        {{ own ? t('submissions.grades.emptyStudent') : t('groupGrading.grades.empty') }}
      </p>
      <template v-else>
        <AppNote v-if="proposed" closable class="group-grades__note" @close="proposed = false">
          {{ t('groupGrading.adjust.proposed') }}
          <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
            t('submissions.grade.myActions')
          }}</router-link>
        </AppNote>
        <p v-if="groupNow" class="group-grades__group">
          <span class="app-muted">{{
            t('groupGrading.grades.groupScore', { group: submission.group_name ?? groupNow.group_name ?? '' })
          }}</span>
          <ScoreText :score="groupNow.score" :out-of="pointsPossible ?? null" />
        </p>
        <ul class="group-grades__list">
          <li v-for="l in lines" :key="l.memberId" class="group-grades__item">
            <div class="group-grades__who">
              <span class="group-grades__name">
                <template v-if="own">{{ t('groupGrading.grades.yours') }}</template>
                <template v-else-if="l.name">{{ l.name }}</template>
                <MemberName v-else :id="l.memberId" />
              </span>
              <StatusTag v-if="l.grade" vocab="gradeState" :value="l.grade.state" />
            </div>
            <template v-if="l.grade">
              <router-link
                :to="{ name: 'course-grade', params: { courseId, gradeId: l.grade.id } }"
                class="group-grades__score"
                :aria-label="t('groupGrading.grades.open', { name: l.name ?? t('groupGrading.editor.thisMember') })"
              >
                <ScoreText :score="l.grade.score" :out-of="pointsPossible ?? null" />
              </router-link>
              <div class="group-grades__how" :class="{ 'is-adjusted': isGraderAdjustment(l.grade.group?.adjustment) }">
                <AdjustmentText :adjustment="l.grade.group?.adjustment" reason :by="!own" detail />
              </div>
              <div v-if="canAdjust(l.grade)" class="group-grades__actions">
                <el-button size="small" @click="adjust(l)">
                  <span>{{ t('groupGrading.grades.adjust') }}</span>
                  <StatusTag
                    v-if="adjustNeedsApproval(l.grade)"
                    vocab="level"
                    value="confirm_required"
                    size="small"
                    class="group-grades__approval"
                  />
                </el-button>
              </div>
            </template>
            <p v-else class="app-muted group-grades__ungraded">
              {{
                l.reached === true
                  ? t('groupGrading.grades.noGrade')
                  : l.reached === false
                    ? t('groupGrading.grades.unreached')
                    : t('groupGrading.grades.notShown')
              }}
            </p>
          </li>
        </ul>
        <p v-if="ungraded && !own" class="app-form-hint group-grades__hint">
          {{ anyDraft ? t('groupGrading.grades.noGradeDraft') : t('groupGrading.grades.noGradePosted') }}
        </p>
        <p v-if="anyDraft && !own" class="app-form-hint group-grades__hint">{{ t('submissions.grades.draftHint') }}</p>

        <template v-if="earlier.length && !own">
          <el-button link type="primary" class="group-grades__toggle" @click="showEarlier = !showEarlier">
            {{
              showEarlier
                ? t('groupGrading.grades.hideEarlier')
                : t('groupGrading.grades.showEarlier', { n: earlier.length }, earlier.length)
            }}
          </el-button>
          <ul v-if="showEarlier" class="group-grades__earlier">
            <li v-for="g in earlier" :key="g.id">
              <router-link :to="{ name: 'course-grade', params: { courseId, gradeId: g.id } }">
                <template v-if="nameOf(g.student_member_id)">{{ nameOf(g.student_member_id) }}</template>
                <MemberName v-else :id="g.student_member_id" />
              </router-link>
              <ScoreText :score="g.score" :out-of="pointsPossible ?? null" hide-percent />
              <StatusTag vocab="gradeState" value="superseded" />
              <span class="app-muted"><TimeText :value="g.created_at" /></span>
            </li>
          </ul>
        </template>
      </template>
    </AsyncState>
    <PendingGradeProposals
      v-if="proposals?.length"
      :course-id="courseId"
      :proposals="proposals"
      :points-possible="pointsPossible"
      :live-draft="liveDraft"
      :live-posted="livePosted"
    />
    <AdjustGradeDialog
      v-if="adjusting"
      v-model="adjustOpen"
      :course-id="courseId"
      :grade="adjusting.grade"
      :name="adjusting.name"
      :points-possible="pointsPossible"
      @done="onAdjusted"
    />
  </section>
</template>

<style scoped>
.group-grades__all {
  font-size: var(--app-text-sm);
  font-weight: 400;
  text-decoration: none;
}
.group-grades__all:hover {
  text-decoration: underline;
}
.group-grades__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
.group-grades__note {
  margin-bottom: var(--app-space-md);
}
.group-grades__group {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-sm);
  flex-wrap: wrap;
  margin: 0 0 var(--app-space-md);
}
.group-grades__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-sm);
}
/* The card's own width lays each member's line out, not the window's. */
.group-grades {
  container-type: inline-size;
}
.group-grades__item {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(110px, auto) minmax(0, 2fr) auto;
  align-items: center;
  gap: var(--app-space-xs) var(--app-space-md);
  padding: var(--app-space-sm) var(--app-space-md);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
}
.group-grades__who {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
  flex-wrap: wrap;
  min-width: 0;
}
.group-grades__name {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.group-grades__score {
  color: inherit;
  text-decoration: none;
}
.group-grades__score:hover {
  text-decoration: underline;
}
.group-grades__how {
  font-size: var(--app-text-sm);
  min-width: 0;
}
.group-grades__ungraded {
  grid-column: 2 / -1;
  margin: 0;
  font-size: var(--app-text-sm);
}
.group-grades__approval {
  margin-left: 6px;
}
.group-grades__hint {
  margin: var(--app-space-sm) 0 0;
}
.group-grades__toggle {
  margin-top: var(--app-space-sm);
}
.group-grades__earlier {
  list-style: none;
  margin: var(--app-space-xs) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-xs);
  font-size: var(--app-text-sm);
}
.group-grades__earlier li {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
  flex-wrap: wrap;
}
/* As narrow as a phone's card: each member's line stacks. */
@container (max-width: 542px) {
  .group-grades__item {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .group-grades__how {
    grid-column: 1 / -1;
  }
  .group-grades__actions {
    grid-column: 1 / -1;
  }
  .group-grades__ungraded {
    grid-column: 1 / -1;
  }
}
</style>
