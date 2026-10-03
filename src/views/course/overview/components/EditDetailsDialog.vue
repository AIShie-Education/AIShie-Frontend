<script setup lang="ts">
// course.update_details: a course's instructors — whoever manages its members —
// change its title and description from their seat. What makes the course the
// offering it is (code, section, term) and where it sits (its department) are
// shown as they are, and said to be its administrators' to change.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { read } from '@/api/http'
import type { Course, Term } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import MarkdownEditor from '@/components/MarkdownEditor.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ course: Course; administers: boolean }>()
const emit = defineEmits<{ done: [status: 'executed' | 'proposed'] }>()
const { t } = useI18n()
const store = useCourseStore()
const write = useWrite('course.update_details')
const departments = useDepartmentTree({ immediate: false })

const MAX_TITLE = 300
const formRef = ref<FormInstance>()
const form = reactive({ title: '', description: '' })

const terms = useAsync<Term[]>(() => read('term.list', {}).then((o) => o.terms ?? []), { immediate: false })
watch(
  open,
  (v) => {
    if (!v) return
    form.title = props.course.title
    form.description = props.course.description ?? ''
    formRef.value?.clearValidate()
    if (!terms.data.value) void terms.reload()
    void departments.ensure()
  },
  { immediate: true },
)

const termName = computed(() => terms.data.value?.find((x) => x.id === props.course.term_id)?.name ?? null)
const deptName = computed(() =>
  departments.byId.value.get(props.course.dept_id) ? departments.pathLabel(props.course.dept_id) : null,
)
const needsApproval = computed(() => store.needsApproval('member_manage'))

const rules = computed<FormRules>(() => ({
  title: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        (v ?? '').trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
}))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const title = form.title.trim()
  const description = form.description
  const args: { course_id: string; title?: string; description?: string } = { course_id: props.course.id }
  if (title !== props.course.title) args.title = title
  if (description !== (props.course.description ?? '')) args.description = description
  if (args.title === undefined && args.description === undefined) {
    ElMessage({ type: 'info', message: t('overview.details.nothingChanged') })
    open.value = false
    return
  }
  // A refusal is said as every write's is; a proposal too.
  const out = await write.run(args, { success: false })
  if (!out) return
  if (out.status === 'executed' && !out.replayed) {
    ElMessage(
      out.result.changed
        ? { type: 'success', message: t('overview.details.saved') }
        : { type: 'info', message: t('overview.details.nothingChanged') },
    )
  }
  open.value = false
  emit('done', out.status)
}
</script>

<template>
  <el-dialog v-model="open" :title="t('overview.details.title')" width="560px" destroy-on-close>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      :validate-on-rule-change="false"
      label-position="top"
      :disabled="write.pending.value"
      @submit.prevent="submit"
    >
      <el-form-item :label="t('overview.details.courseTitle')" prop="title">
        <el-input v-model="form.title" name="title" :maxlength="MAX_TITLE" />
      </el-form-item>
      <el-form-item :label="t('overview.details.description')">
        <MarkdownEditor
          v-model="form.description"
          :rows="8"
          :placeholder="t('overview.details.descriptionPlaceholder')"
        />
      </el-form-item>
    </el-form>

    <section class="details__fixed" :aria-label="t('overview.details.fixedTitle')">
      <h3 class="details__fixed-title">
        <el-icon><Lock /></el-icon>{{ t('overview.details.fixedTitle') }}
      </h3>
      <dl class="details__facts">
        <div>
          <dt>{{ t('overview.details.code') }}</dt>
          <dd>{{ course.code }}</dd>
        </div>
        <div>
          <dt>{{ t('overview.details.section') }}</dt>
          <dd>{{ course.section || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('overview.details.term') }}</dt>
          <dd>{{ termName ?? '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('overview.details.department') }}</dt>
          <dd>{{ deptName ?? '—' }}</dd>
        </div>
      </dl>
      <p class="app-form-hint details__note">
        {{ t('overview.details.fixedNote') }}
        <router-link v-if="administers" :to="{ name: 'admin-course', params: { courseId: course.id } }">
          {{ t('overview.details.toAdmin') }}
        </router-link>
      </p>
    </section>

    <el-alert
      v-if="needsApproval"
      type="info"
      :closable="false"
      show-icon
      class="details__approval"
      :title="t('overview.details.approvalNote')"
    />

    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="write.pending.value" :disabled="!store.writable" @click="submit">
        {{ t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.details__fixed {
  margin-top: 4px;
  padding: 12px 14px;
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}
.details__fixed-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.details__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px 16px;
  margin: 0;
}
.details__facts dt {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.details__facts dd {
  margin: 2px 0 0;
  word-break: break-word;
}
.details__note {
  margin: 10px 0 0;
}
.details__approval {
  margin-top: 12px;
}
</style>
