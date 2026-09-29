<script setup lang="ts">
// What a grader may do with one of a student's totals: override it, change or
// take off an override, and comment on it. A total is overridden or commented
// on once one has been written down (a grade beneath it posted); until then,
// and on a component graded directly, the actions are offered greyed out with
// why. Offered only to a seat that may regrade (grade_submit and grade_post)
// over the whole course; Core decides.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { Decimal } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import TotalDialog from './TotalDialog.vue'
import { formatPct } from './grading'

const props = defineProps<{
  courseId: string
  studentMemberId: string
  componentId: string
  what: string
  computedPercent: Decimal | null
  /** The total as written down now, if one is (a live posted computed grade). */
  total?: {
    id: string
    feedback?: string | null
    override?: { score: Decimal; reason?: string | null } | null
  } | null
  /** Graded directly: it has no total, only its own grade. */
  direct?: boolean
  size?: 'small' | 'default'
}>()
/** changed: the total now stands as the grade named, where Core said (it is written again as a new grade). */
const emit = defineEmits<{ changed: [gradeId: string | null] }>()
const { t } = useI18n()
const course = useCourseStore()
const clearWrite = useWrite('grade.clear_override')
const needsApproval = computed(() => course.needsApprovalAll(['grade_submit', 'grade_post']))

/** Why nothing here can be done now, or null. */
const blocked = computed(() => {
  if (props.direct) return t('grades.override.gradedDirectly')
  if (!props.total) return t('grades.override.noTotal')
  if (!course.writable) return t('common.archivedCourse')
  return null
})
const overridden = computed(() => !!props.total?.override)

const dialog = ref<'override' | 'comment' | null>(null)
const dialogOpen = computed({
  get: () => dialog.value !== null,
  set: (v: boolean) => {
    if (!v) dialog.value = null
  },
})

async function clearOverride() {
  try {
    await ElMessageBox.confirm(
      t('grades.override.clearBody', { value: formatPct(props.computedPercent) }) +
        (needsApproval.value ? ` ${t('grades.override.approvalNote')}` : ''),
      t('grades.override.clearTitle'),
      {
        type: 'warning',
        confirmButtonText: t('grades.override.clearConfirm'),
        cancelButtonText: t('common.actions.cancel'),
      },
    )
  } catch {
    return
  }
  const out = await clearWrite.run(
    { course_id: props.courseId, student_member_id: props.studentMemberId, component_id: props.componentId },
    { success: false, reasons: 'grades.override.refusal' },
  )
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage({
      type: 'success',
      message: out.result.snapshots
        ? t('grades.override.cleared', { n: out.result.snapshots })
        : t('grades.override.clearedTop'),
    })
  }
  emit('changed', out.status === 'executed' ? out.result.grade_id : null)
}

function onCommand(cmd: string | number | object) {
  if (cmd === 'override' || cmd === 'comment') dialog.value = cmd
  else if (cmd === 'clear') void clearOverride()
}
</script>

<template>
  <span class="total-menu">
    <el-tooltip :content="blocked ?? ''" :disabled="!blocked" placement="top">
      <span>
        <el-dropdown trigger="click" :disabled="!!blocked" @command="onCommand">
          <el-button
            :size="size ?? 'small'"
            :disabled="!!blocked"
            :loading="clearWrite.pending.value"
            class="total-menu__button"
            :aria-label="t('grades.override.actions') + ': ' + what"
          >
            <el-icon><EditPen /></el-icon>
            <span>{{ t('grades.override.actions') }}</span>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="override">
                <el-icon><Edit /></el-icon>{{ overridden ? t('grades.override.change') : t('grades.override.action') }}
              </el-dropdown-item>
              <el-dropdown-item v-if="overridden" command="clear">
                <el-icon><RefreshLeft /></el-icon>{{ t('grades.override.clear') }}
              </el-dropdown-item>
              <el-dropdown-item command="comment" divided>
                <el-icon><ChatLineSquare /></el-icon
                >{{ total?.feedback ? t('grades.override.editComment') : t('grades.override.comment') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </span>
    </el-tooltip>
    <el-tag v-if="needsApproval" size="small" type="warning" effect="plain" disable-transitions>
      {{ t('enums.level.confirm_required') }}
    </el-tag>
    <TotalDialog
      v-if="dialog"
      v-model="dialogOpen"
      :mode="dialog"
      :course-id="courseId"
      :student-member-id="studentMemberId"
      :component-id="componentId"
      :what="what"
      :computed-percent="computedPercent"
      :current="total?.override ?? null"
      :feedback="total?.feedback ?? null"
      @done="(out) => emit('changed', out.status === 'executed' ? out.result.grade_id : null)"
    />
  </span>
</template>

<style scoped>
.total-menu {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.total-menu__button .el-icon + span {
  margin-left: 4px;
}
</style>
