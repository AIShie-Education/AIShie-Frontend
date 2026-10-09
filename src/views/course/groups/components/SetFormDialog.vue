<script setup lang="ts">
// Making a group set, or changing one (group_set.create, .update): its name,
// what it is for, and whether students may sign themselves up to its groups,
// until when. A name another set not archived has is refused (name_taken),
// and said on the name's field.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormItemRule } from 'element-plus'
import StatusTag from '@/components/StatusTag.vue'
import type { WriteOutcome } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { timeZoneName } from '@/utils/format'
import { GROUP_REFUSALS, type GroupSet } from './groupModel'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ courseId: string; set?: GroupSet | null }>()
const emit = defineEmits<{ saved: [out: WriteOutcome<unknown>, id: string | null] }>()
const { t, locale } = useI18n()
const course = useCourseStore()

const editing = computed(() => !!props.set)
const create = useWrite('group_set.create')
const update = useWrite('group_set.update')
const pending = computed(() => create.pending.value || update.pending.value)

const form = reactive({ name: '', description: '', signupOpen: false, closesAt: null as Date | null })
const formRef = ref<FormInstance>()
/** The server's refusal of the name, said on its field. */
const nameTaken = ref(false)
const failure = ref<string | null>(null)

watch(open, (on) => {
  if (!on) return
  const s = props.set
  form.name = s?.name ?? ''
  form.description = s?.description ?? ''
  form.signupOpen = s?.signup.open ?? false
  form.closesAt = s?.signup.closes_at ? new Date(s.signup.closes_at) : null
  nameTaken.value = false
  failure.value = null
})
watch(
  () => form.name,
  () => (nameTaken.value = false),
)

const zone = computed(() => (locale.value, timeZoneName((form.closesAt ?? new Date()).toISOString())))
const pastDeadline = computed(() => !!form.closesAt && form.closesAt.getTime() <= Date.now())

const rules = computed<Record<string, FormItemRule[]>>(() => ({
  name: [
    {
      validator: (_r, _v, done) => {
        const name = form.name.trim()
        if (!name) return done(new Error(t('groups.setForm.nameRequired')))
        if ([...name].length > 100) return done(new Error(t('groups.setForm.nameTooLong')))
        if (/[\u0000-\u001f\u007f]/.test(name)) return done(new Error(t('groups.setForm.nameOneLine')))
        if (nameTaken.value) return done(new Error(t('groups.refusal.name_taken')))
        done()
      },
      trigger: 'blur',
    },
  ],
  description: [{ max: 2000, message: t('groups.setForm.descriptionTooLong'), trigger: 'blur' }],
}))

function sameTime(a: Date | null, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return Math.floor(a.getTime() / 60_000) === Math.floor(Date.parse(b) / 60_000)
}

async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  failure.value = null
  const name = form.name.trim()
  const description = form.description.trim()
  const s = props.set
  let out: WriteOutcome<unknown> | null
  let id: string | null = null
  if (!s) {
    const o = await create.run(
      {
        course_id: props.courseId,
        name,
        description: description || undefined,
        signup_open: form.signupOpen || undefined,
        signup_closes_at: form.closesAt ? form.closesAt.toISOString() : undefined,
      },
      { notify: false },
    )
    if (!o) return refused(create.lastError.value)
    announce(o, { success: t('groups.setForm.created', { name }) })
    out = o
    if (o.status === 'executed') id = o.result.id
  } else {
    const args: Parameters<typeof update.run>[0] = { course_id: props.courseId, set_id: s.id }
    if (name !== s.name) args.name = name
    if (description !== (s.description ?? '')) args.description = description
    if (form.signupOpen !== s.signup.open) args.signup_open = form.signupOpen
    if (!sameTime(form.closesAt, s.signup.closes_at)) {
      if (form.closesAt) args.signup_closes_at = form.closesAt.toISOString()
      else args.clear_signup_closes_at = true
    }
    if (Object.keys(args).length === 2) {
      open.value = false
      return
    }
    out = await update.run(args, { notify: false })
    if (!out) return refused(update.lastError.value)
    announce(out, { success: t('groups.setForm.saved') })
  }
  emit('saved', out, id)
  open.value = false
}

function refused(e: unknown) {
  const reason = (e as { details?: { reason?: unknown } } | null)?.details?.reason
  if (reason === 'name_taken') {
    nameTaken.value = true
    void formRef.value?.validateField('name').catch(() => undefined)
    return
  }
  failure.value = errorMessage(e, { reasons: GROUP_REFUSALS })
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="editing ? t('groups.setForm.editTitle') : t('groups.setForm.createTitle')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    class="set-form"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="save">
      <el-form-item :label="t('groups.setForm.name')" prop="name">
        <el-input v-model="form.name" maxlength="100" :placeholder="t('groups.setForm.namePlaceholder')" />
      </el-form-item>
      <el-form-item prop="description">
        <template #label>
          {{ t('groups.setForm.description')
          }}<span class="set-form__optional">{{ t('common.labels.optionalTag') }}</span>
        </template>
        <el-input
          v-model="form.description"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          maxlength="2000"
          :placeholder="t('groups.setForm.descriptionPlaceholder')"
        />
      </el-form-item>
      <fieldset class="set-form__signup">
        <legend class="set-form__legend">{{ t('groups.setForm.signup') }}</legend>
        <el-form-item>
          <el-checkbox v-model="form.signupOpen" :label="t('groups.setForm.signupOpen')" />
          <div class="app-form-hint">{{ t('groups.setForm.signupHint') }}</div>
        </el-form-item>
        <el-form-item :label="t('groups.setForm.deadline')">
          <el-date-picker
            v-model="form.closesAt"
            type="datetime"
            format="YYYY-MM-DD HH:mm"
            :placeholder="t('groups.setForm.deadlinePlaceholder')"
            :aria-label="t('groups.setForm.deadline')"
            clearable
          />
          <div class="app-form-hint">{{ t('groups.setForm.deadlineHint', { zone }) }}</div>
          <el-alert
            v-if="form.signupOpen && pastDeadline"
            type="warning"
            :title="t('groups.setForm.deadlinePast')"
            :closable="false"
            show-icon
            class="set-form__past"
          />
        </el-form-item>
      </fieldset>
      <el-alert v-if="failure" type="error" :title="failure" :closable="false" show-icon />
    </el-form>
    <template #footer>
      <div class="set-form__footer">
        <StatusTag v-if="course.needsApproval('assignment_write')" vocab="level" value="confirm_required" />
        <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button type="primary" :loading="pending" :disabled="!course.writable" @click="save">
          {{ editing ? t('common.actions.save') : t('common.actions.create') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.set-form__optional {
  color: var(--app-ink-3);
  font-weight: 400;
}
.set-form__signup {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.set-form__legend {
  padding: 0;
  margin-bottom: var(--app-space-sm);
  font-weight: var(--app-weight-strong);
  color: var(--app-ink);
}
.set-form__past {
  margin-top: var(--app-space-sm);
}
.set-form__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-sm);
}
</style>
