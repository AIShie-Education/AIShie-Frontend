<script setup lang="ts">
// Correcting whether a handed-in attempt counts as late: an extension
// granted, a clock that was wrong. It is the one change a handed-in attempt
// allows, and it is for graders (grade_submit), not for the student.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { Submission } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'

const props = defineProps<{ courseId: string; submission: Submission }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('submission.set_lateness')

const to = computed(() => (props.submission.state === 'late' ? 'submitted' : 'late'))

async function change() {
  try {
    await ElMessageBox.confirm(
      to.value === 'late' ? t('submissions.lateness.confirmLate') : t('submissions.lateness.confirmOnTime'),
      t('submissions.lateness.confirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.actions.confirm'),
        cancelButtonText: t('common.actions.cancel'),
      },
    )
  } catch {
    return
  }
  const out = await run(
    { course_id: props.courseId, submission_id: props.submission.id, state: to.value },
    { success: t('submissions.lateness.done') },
  )
  if (out) emit('changed')
}
</script>

<template>
  <div class="lateness">
    <el-button :loading="pending" :disabled="!course.writable" @click="change">
      <el-icon><Timer /></el-icon>
      <span>{{ to === 'late' ? t('submissions.lateness.markLate') : t('submissions.lateness.markOnTime') }}</span>
    </el-button>
    <el-tag v-if="course.needsApproval('grade_submit')" type="warning" size="small" disable-transitions>
      {{ t('enums.level.confirm_required') }}
    </el-tag>
  </div>
</template>

<style scoped>
.lateness {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
