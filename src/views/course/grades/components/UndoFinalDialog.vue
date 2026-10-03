<script setup lang="ts">
// grade.undo_ungraded_as_zero: taking back posting as final, for one student or
// for every student whose totals count ungraded work as zero. Their totals are
// written again at once as a grade so far; grades themselves are untouched.
// Gated as posting as final is (grade_post, over the whole course). The
// dialog says what it does, and pressing its button, after a last
// confirmation, does it; Core's refusal is said in words.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import MemberSelect from '@/components/MemberSelect.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ courseId: string }>()
const emit = defineEmits<{ done: [status: 'executed' | 'proposed'] }>()
const { t } = useI18n()
const course = useCourseStore()
const { run, pending } = useWrite('grade.undo_ungraded_as_zero')

const who = ref<'all' | 'one'>('all')
const student = ref<string | undefined>(undefined)
const studentModel = computed({
  get: () => student.value,
  set: (v: string | string[] | undefined) => (student.value = typeof v === 'string' && v ? v : undefined),
})
const missing = ref(false)
watch(open, (v) => {
  if (!v) return
  who.value = 'all'
  student.value = undefined
  missing.value = false
})
watch([who, student], () => (missing.value = false))
const needsApproval = computed(() => course.needsApproval('grade_post'))

async function submit() {
  if (who.value === 'one' && !student.value) {
    missing.value = true
    return
  }
  const one = who.value === 'one' ? student.value : undefined
  try {
    await ElMessageBox.confirm(
      one ? t('grades.undoFinal.confirmOne', { name: course.memberName(one) ?? '' }) : t('grades.undoFinal.confirmAll'),
      t('grades.undoFinal.confirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('grades.undoFinal.confirmButton'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  const out = await run(
    one ? { course_id: props.courseId, student_member_id: one } : { course_id: props.courseId, all_students: true },
    { success: false, reasons: 'grades.undoFinal.refusal' },
  )
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage({
      type: 'success',
      message: t('grades.undoFinal.done', { n: out.result.students, s: out.result.snapshots }, out.result.students),
    })
  }
  open.value = false
  emit('done', out.status)
}
</script>

<template>
  <el-dialog v-model="open" :title="t('grades.undoFinal.title')" width="560px" destroy-on-close>
    <p class="undo-final__intro">{{ t('grades.undoFinal.intro') }}</p>
    <el-form label-position="top" :disabled="pending" @submit.prevent="submit">
      <el-form-item :label="t('grades.undoFinal.who')">
        <el-radio-group v-model="who" class="undo-final__who">
          <el-radio value="all" border class="undo-final__option">{{ t('grades.undoFinal.all') }}</el-radio>
          <el-radio value="one" border class="undo-final__option">{{ t('grades.undoFinal.oneStudent') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item
        v-if="who === 'one'"
        :label="t('grades.undoFinal.pickStudent')"
        :error="missing ? t('grades.undoFinal.pickRequired') : ''"
      >
        <MemberSelect
          v-model="studentModel"
          role="student"
          include-inactive
          :placeholder="t('grades.undoFinal.pickStudent')"
          class="undo-final__student"
        />
      </el-form-item>
    </el-form>
    <el-alert
      v-if="needsApproval"
      type="info"
      :closable="false"
      show-icon
      :title="t('grades.undoFinal.approvalNote')"
    />
    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="submit">
        {{ t('grades.undoFinal.confirmButton') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.undo-final__intro {
  margin: 0 0 14px;
  line-height: var(--app-lh-text);
}
.undo-final__who {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.undo-final__option {
  margin-right: 0;
  height: auto;
  padding-top: 8px;
  padding-bottom: 8px;
  white-space: normal;
}
.undo-final__student {
  width: 100%;
}
</style>
