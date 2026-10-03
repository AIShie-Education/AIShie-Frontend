<script setup lang="ts">
// grade.post: release draft grades to students, named one by one or every
// draft waiting for an assignment, and write down each affected student's
// rolled-up totals as they stand.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolOut, WriteOutcome } from '@/api/http'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import AppNote from '@/components/AppNote.vue'
import MemberName from '@/components/MemberName.vue'
import FinalOption from './FinalOption.vue'
import ScoreText from './ScoreText.vue'
import { confirmFinal, type PostRow } from './grading'

const visible = defineModel<boolean>({ default: false })
const props = defineProps<{
  courseId: string
  mode: 'ids' | 'assignment'
  rows?: PostRow[]
  assignmentId?: string
  /** How many drafts for the assignment are loaded on the page. */
  loadedDrafts?: number
  /**
   * The page lists one student's grades: its count says nothing of the
   * others, whose drafts for the assignment are posted too.
   */
  studentFiltered?: boolean
}>()
const emit = defineEmits<{ done: [out: WriteOutcome<ToolOut<'grade.post'>>] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.post')

const final = ref(false)
const needsApproval = computed(() => course.needsApproval('grade_post'))
const assignmentTitle = computed(() => course.assignmentTitle(props.assignmentId) ?? props.assignmentId ?? '')
const count = computed(() => props.rows?.length ?? 0)

function onOpen() {
  final.value = false
}

async function submit() {
  if (final.value && !(await confirmFinal(t))) return
  const args =
    props.mode === 'assignment'
      ? {
          course_id: props.courseId,
          assignment_id: props.assignmentId,
          treat_ungraded_as_zero: final.value || undefined,
        }
      : {
          course_id: props.courseId,
          grade_ids: (props.rows ?? []).map((r) => r.id),
          treat_ungraded_as_zero: final.value || undefined,
        }
  const out = await run(args, { success: false })
  if (!out) return
  visible.value = false
  emit('done', out)
}
</script>

<template>
  <el-dialog v-model="visible" :title="t('grades.post.title')" width="560px" destroy-on-close @open="onOpen">
    <p class="post-dialog__intro">{{ t('grades.post.intro') }}</p>

    <div class="post-dialog__what">
      <template v-if="mode === 'assignment'">
        <div class="post-dialog__what-title">{{ t('grades.post.whatAssignment', { title: assignmentTitle }) }}</div>
        <p class="app-form-hint">
          {{
            studentFiltered
              ? t('grades.post.assignmentHintFiltered')
              : t('grades.post.assignmentHint', { n: loadedDrafts ?? 0 })
          }}
        </p>
      </template>
      <template v-else>
        <div class="post-dialog__what-title">{{ t('grades.post.whatSelected', { n: count }) }}</div>
        <ul class="post-dialog__rows">
          <li v-for="r in rows" :key="r.id">
            <MemberName :id="r.studentMemberId" />
            <span class="post-dialog__label">{{ r.label }}</span>
            <ScoreText :score="r.score" :out-of="r.outOf" hide-percent />
          </li>
        </ul>
      </template>
    </div>

    <FinalOption v-model="final" :disabled="pending" />

    <AppNote v-if="needsApproval" class="post-dialog__approval">
      {{ mode === 'assignment' ? t('grades.post.proposalAssignment') : t('grades.post.proposalIds') }}
    </AppNote>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="pending"
        :disabled="!course.writable || (mode === 'ids' && !count) || (mode === 'assignment' && !assignmentId)"
        @click="submit"
      >
        {{ needsApproval ? t('grades.post.submitProposal') : t('grades.post.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.post-dialog__intro {
  margin: 0 0 12px;
  line-height: var(--app-lh-text);
}
.post-dialog__what {
  background: var(--el-fill-color-light);
  border-radius: var(--app-radius-item);
  padding: 10px 12px;
  margin-bottom: 16px;
}
.post-dialog__what-title {
  font-weight: var(--app-heading-weight);
}
.post-dialog__rows {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 200px;
  overflow: auto;
}
.post-dialog__rows li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 3px 0;
  font-size: var(--app-text-sm);
}
.post-dialog__label {
  color: var(--el-text-color-secondary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.post-dialog__approval {
  margin-top: 12px;
}
</style>
