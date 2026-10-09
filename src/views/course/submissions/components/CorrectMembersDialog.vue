<script setup lang="ts">
// submission.set_members: correct whose work a group's submission is, once
// it is handed in or recorded missing. Add a student the group handed it in
// without (one never placed in a group, or placed in it since), or take off
// someone who was not part of it. A member with a grade on it stays: the
// grade is theirs, on this work. At least one member stays. Gated as
// correcting lateness is (grade_submit): with whom a student handed work in
// is not theirs to declare.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GradeSummary, Submission } from '@/api/types'
import AppNote from '@/components/AppNote.vue'
import MemberName from '@/components/MemberName.vue'
import MemberSelect from '@/components/MemberSelect.vue'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatList } from '@/utils/format'
import { useUiStore } from '@/stores/ui'
import { workMemberIds } from './groupGrading'

const visible = defineModel<boolean>({ default: false })
const props = defineProps<{
  courseId: string
  submission: Submission
  /** Every grade read for this work. */
  grades: GradeSummary[]
  /** In the group now, not part of the work: offered first. */
  candidates: string[]
  nameOf: (id: string) => string | null
}>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()
const { run, pending } = useWrite('submission.set_members')
const needsApproval = computed(() => course.needsApproval('grade_submit'))

const members = computed(() => workMemberIds(props.submission))
/** A member with a grade on this work, entered or proposed: Core keeps them (member_graded). */
const graded = computed(
  () => new Set(props.grades.filter((g) => g.submission_id === props.submission.id).map((g) => g.student_member_id)),
)

const removing = ref<string[]>([])
const adding = ref<string[]>([])
const tried = ref(false)
watch(visible, (open) => {
  if (!open) return
  removing.value = []
  adding.value = []
  tried.value = false
})

const addModel = computed({
  get: () => adding.value,
  set: (v: string | string[] | undefined) => {
    const list = Array.isArray(v) ? v : v ? [v] : []
    adding.value = list.filter((id) => !members.value.includes(id))
  },
})
function toggleRemove(id: string, on: boolean) {
  removing.value = on ? [...removing.value, id] : removing.value.filter((x) => x !== id)
}
function suggest(id: string) {
  if (!adding.value.includes(id)) adding.value = [...adding.value, id]
}
const label = (id: string) => props.nameOf(id) ?? course.memberName(id) ?? t('groupGrading.editor.thisMember')

const nothing = computed(() => !removing.value.length && !adding.value.length)
const empty = computed(() => members.value.length - removing.value.length + adding.value.length < 1)
const problem = computed(() => {
  if (empty.value) return t('groupGrading.correct.empty')
  if (tried.value && nothing.value) return t('groupGrading.correct.nothing')
  return null
})
const summary = computed(() => {
  void ui.locale
  const parts: string[] = []
  if (adding.value.length) parts.push(t('groupGrading.correct.willAdd', { names: formatList(adding.value.map(label)) }))
  if (removing.value.length)
    parts.push(t('groupGrading.correct.willRemove', { names: formatList(removing.value.map(label)) }))
  return parts
})

async function submit() {
  tried.value = true
  if (nothing.value || empty.value) return
  const out = await run(
    {
      course_id: props.courseId,
      submission_id: props.submission.id,
      add: adding.value.length ? adding.value : undefined,
      remove: removing.value.length ? removing.value : undefined,
    },
    { success: t('groupGrading.correct.done'), reasons: 'groupGrading.refusal' },
  )
  if (!out) return
  visible.value = false
  emit('done')
}
</script>

<template>
  <el-dialog v-model="visible" :title="t('groupGrading.correct.title')" width="560px" destroy-on-close>
    <p class="app-form-hint correct__intro">{{ t('groupGrading.correct.intro') }}</p>
    <el-form label-position="top" :disabled="pending" @submit.prevent="submit">
      <el-form-item :label="t('groupGrading.correct.current')">
        <ul class="correct__list">
          <li v-for="id in members" :key="id">
            <el-checkbox
              :model-value="removing.includes(id)"
              :disabled="graded.has(id)"
              @update:model-value="(v: string | number | boolean) => toggleRemove(id, !!v)"
            >
              {{ t('groupGrading.correct.remove', { name: label(id) }) }}
            </el-checkbox>
            <span v-if="graded.has(id)" class="correct__why">{{ t('groupGrading.correct.graded') }}</span>
          </li>
        </ul>
      </el-form-item>
      <el-form-item :label="t('groupGrading.correct.add')">
        <div class="correct__add">
          <MemberSelect
            v-model="addModel"
            multiple
            role="student"
            :statuses="['active', 'paused']"
            :placeholder="t('groupGrading.correct.addPlaceholder')"
          />
          <div v-if="candidates.filter((c) => !adding.includes(c)).length" class="correct__suggest">
            <span class="app-muted">{{ t('groupGrading.correct.suggest') }}</span>
            <el-button
              v-for="id in candidates.filter((c) => !adding.includes(c))"
              :key="id"
              size="small"
              @click="suggest(id)"
            >
              <el-icon><Plus /></el-icon>
              <span v-if="nameOf(id)">{{ nameOf(id) }}</span>
              <MemberName v-else :id="id" />
            </el-button>
          </div>
          <p class="app-form-hint correct__hint">{{ t('groupGrading.correct.addHint') }}</p>
        </div>
      </el-form-item>
      <ul v-if="summary.length" class="correct__summary" aria-live="polite">
        <li v-for="s in summary" :key="s">{{ s }}</li>
      </ul>
      <p v-if="problem" class="correct__problem" role="alert">{{ problem }}</p>
      <AppNote v-if="needsApproval">{{ t('groupGrading.correct.approvalNote') }}</AppNote>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!course.writable || empty" @click="submit">
        {{ needsApproval ? t('groupGrading.correct.propose') : t('groupGrading.correct.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.correct__intro {
  margin: 0 0 var(--app-space-md);
}
.correct__list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
}
.correct__list li {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
  flex-wrap: wrap;
}
.correct__why {
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
.correct__add {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-sm);
}
.correct__suggest {
  display: flex;
  align-items: center;
  gap: var(--app-space-xs) var(--app-space-sm);
  flex-wrap: wrap;
  font-size: var(--app-text-sm);
}
.correct__suggest .el-button + .el-button {
  margin-left: 0;
}
.correct__hint {
  margin: 0;
}
.correct__summary {
  margin: 0 0 var(--app-space-sm);
  padding-left: 18px;
  font-size: var(--app-text-sm);
}
.correct__problem {
  margin: 0 0 var(--app-space-sm);
  font-size: var(--app-text-xs);
  color: var(--el-color-danger);
}
</style>
