<script setup lang="ts">
// Whose work a group's submission is: its group's members now while it is a
// draft, and those it was handed in (or recorded missing) for once it is
// not, which a later change of the group never changes. To those who grade,
// each is marked against the group now: who has left it since, and who is in
// it now but not part of this work (joined since, or part of another group's
// work); and they correct whose work it is (submission.set_members), for a
// student the group handed it in without, say. Core gives a seat the
// group's members and their history only of the students it reaches: one
// that does not reach every member of the work is told so, its members
// outside its reach marked as that and nothing else, and offered no
// correction, which Core makes only for a seat that reaches them all.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Upload } from '@element-plus/icons-vue'
import { read } from '@/api/http'
import type { Assignment, GradeSummary, Submission } from '@/api/types'
import AppTag from '@/components/AppTag.vue'
import MemberName from '@/components/MemberName.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import CorrectMembersDialog from './CorrectMembersDialog.vue'
import { memberLines, workMemberIds, type MemberLine, type WorkReach } from './groupGrading'

const props = defineProps<{
  courseId: string
  submission: Submission
  assignment?: Assignment
  /** Every grade read for this work: a member graded on it stays its member. */
  grades: GradeSummary[]
  /** The caller is one of the work's members. */
  own?: boolean
  /** Whether the caller's seat reaches every member of the work (groupGrading.workReach). */
  reach?: WorkReach
}>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const course = useCourseStore()

const draft = computed(() => props.submission.state === 'draft')
/** Whoever grades it, and may read who is in which group (the member list). */
const staff = computed(() => !props.own && course.can('member_read'))

// The group's members now, and every stay in its set's groups, for the marks.
const set = useAsync(
  async () => {
    const setId = props.assignment?.group_set_id
    if (!staff.value || !setId) return null
    return read('group_set.get', { course_id: props.courseId, set_id: setId, include_history: true })
  },
  { watch: [() => props.assignment?.group_set_id, staff, () => props.submission.id], keepData: true },
)
const groupNow = computed(() => {
  const g = set.data.value?.groups?.find((x) => x.id === props.submission.group_id)
  return g?.members ? g.members : null
})

const lines = computed<MemberLine[]>(() =>
  memberLines({
    workMembers: workMemberIds(props.submission),
    groupId: props.submission.group_id,
    frozenAt: props.submission.submitted_at ?? props.submission.created_at,
    // A draft is its group's members now: nothing to mark.
    groupNow: draft.value ? null : groupNow.value,
    history: set.data.value?.history,
    reaches: staff.value ? course.reachesStudent : undefined,
  }),
)
/** Some members of the work are outside the caller's reach: what Core shows of the group leaves them out. */
const someUnreached = computed(() => staff.value && !draft.value && props.reach === 'some')
const nameOf = (id: string) =>
  props.submission.members?.find((m) => m.member_id === id)?.display_name ??
  groupNow.value?.find((m) => m.member_id === id)?.display_name ??
  null

const canCorrect = computed(() => !props.own && !draft.value && course.can('grade_submit') && props.reach !== 'some')
const correcting = ref(false)
const candidates = computed(() =>
  lines.value.filter((l) => l.standing === 'joinedSince' || l.standing === 'notPart').map((l) => l.memberId),
)
function onCorrected() {
  void set.reload()
  emit('changed')
}
</script>

<template>
  <section class="app-card group-work">
    <h2 class="app-card__title">
      <span>{{ t('groupGrading.members.title') }}</span>
      <el-button v-if="canCorrect" size="small" :disabled="!course.writable" @click="correcting = true">
        <el-icon><User /></el-icon>
        <span>{{ t('groupGrading.members.correct') }}</span>
        <StatusTag
          v-if="course.needsApproval('grade_submit')"
          vocab="level"
          value="confirm_required"
          size="small"
          class="group-work__approval"
        />
      </el-button>
    </h2>
    <p class="app-form-hint group-work__hint">
      {{
        draft
          ? t('groupGrading.members.hintDraft')
          : staff
            ? t('groupGrading.members.hintStaff')
            : t('groupGrading.members.hintMember')
      }}
    </p>
    <ul class="group-work__list">
      <li v-for="l in lines" :key="l.memberId" class="group-work__item" :class="`is-${l.standing}`">
        <span class="group-work__name">
          <template v-if="nameOf(l.memberId)">{{ nameOf(l.memberId) }}</template>
          <MemberName v-else :id="l.memberId" />
        </span>
        <AppTag v-if="l.memberId === submission.submitted_by_member_id" variant="outline" :icon="Upload">
          {{ t('groupGrading.members.handedIn') }}
        </AppTag>
        <span v-if="l.standing !== 'work'" class="group-work__standing">
          <i18n-t v-if="l.at" :keypath="`groupGrading.members.standingAt.${l.standing}`" tag="span" scope="global">
            <template #time><TimeText :value="l.at" /></template>
          </i18n-t>
          <template v-else>{{ t(`groupGrading.members.standing.${l.standing}`) }}</template>
        </span>
      </li>
    </ul>
    <p v-if="set.error.value && staff && !draft" class="app-form-hint group-work__hint">
      {{ t('groupGrading.members.groupUnknown') }}
    </p>
    <p v-else-if="someUnreached" class="app-form-hint group-work__hint">
      {{ t('groupGrading.members.unreachedHint') }}
    </p>
    <CorrectMembersDialog
      v-if="canCorrect"
      v-model="correcting"
      :course-id="courseId"
      :submission="submission"
      :grades="grades"
      :candidates="candidates"
      :name-of="nameOf"
      @done="onCorrected"
    />
  </section>
</template>

<style scoped>
.group-work__approval {
  margin-left: 6px;
}
.group-work__hint {
  margin: 0 0 var(--app-space-sm);
}
.group-work__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-xs);
}
.group-work__item {
  display: flex;
  align-items: center;
  gap: var(--app-space-xs) var(--app-space-sm);
  flex-wrap: wrap;
  padding: var(--app-space-xs) 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.group-work__name {
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
/* Not part of the work: the name in the second ink, what they are said in words beside it. */
.group-work__item.is-joinedSince .group-work__name,
.group-work__item.is-notPart .group-work__name {
  font-weight: 400;
  color: var(--app-ink-2);
}
.group-work__standing {
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
</style>
