<script setup lang="ts">
// actor.invite_new: registers someone who is not registered yet and makes
// the link they choose their password with, in one step. It is how a
// department's administrator brings in a new person before seating them.
// An email already registered is refused with that person's id: they are
// then found and seated instead (the `taken` event).
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import type { ToolOut } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { EMAIL_RE } from './adminShared'
import { DEFAULT_INVITE_DAYS, INVITE_DAYS } from './signIn'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ email?: string }>()
const emit = defineEmits<{
  invited: [out: ToolOut<'actor.invite_new'>, name: string]
  taken: [actorId: string | null, email: string]
}>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ name: '', email: '', days: DEFAULT_INVITE_DAYS as number })
const { run, pending, lastError } = useWrite('actor.invite_new')

watch(
  open,
  (v) => {
    if (!v) return
    form.name = ''
    form.email = props.email ?? ''
    form.days = DEFAULT_INVITE_DAYS
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const rules = computed<FormRules>(() => ({
  name: [
    {
      trigger: 'blur',
      validator: (_r, v: string, cb) => (v?.trim() ? cb() : cb(new Error(t('common.errors.required')))),
    },
  ],
  email: [
    {
      trigger: 'blur',
      validator: (_r, v: string, cb) =>
        !v?.trim()
          ? cb(new Error(t('common.errors.required')))
          : EMAIL_RE.test(v.trim())
            ? cb()
            : cb(new Error(t('common.errors.invalidEmail'))),
    },
  ],
}))

async function submit() {
  if (pending.value) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const name = form.name.trim()
  const email = form.email.trim()
  const out = await run(
    { display_name: name, email, expires_in_days: form.days },
    { success: t('deptAdmin.invite.done', { name }) },
  )
  if (!out) {
    const e = lastError.value
    if (e?.details?.reason === 'email_taken') {
      open.value = false
      const id = e.details.actor_id
      emit('taken', typeof id === 'string' ? id : null, email)
    }
    return
  }
  if (out.status !== 'executed') return
  open.value = false
  emit('invited', out.result, name)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('deptAdmin.invite.title')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="app-form-hint invite-new__intro">{{ t('deptAdmin.invite.intro') }}</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('deptAdmin.invite.name')" prop="name">
        <el-input v-model="form.name" name="invite-name" :placeholder="t('deptAdmin.invite.namePlaceholder')" maxlength="200" />
      </el-form-item>
      <el-form-item :label="t('deptAdmin.invite.email')" prop="email">
        <el-input v-model="form.email" name="invite-email" type="email" autocomplete="off" maxlength="320" />
      </el-form-item>
      <el-form-item :label="t('admin.invite.days')">
        <el-select v-model="form.days" class="invite-new__days">
          <el-option v-for="n in INVITE_DAYS" :key="n" :value="n" :label="t('admin.invite.dayOption', { n }, n)" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">
        <el-icon><Message /></el-icon>
        <span>{{ t('deptAdmin.invite.submit') }}</span>
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.invite-new__intro {
  margin: 0 0 16px;
  font-size: 13px;
}
.invite-new__days {
  width: 160px;
}
</style>
