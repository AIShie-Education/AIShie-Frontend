<script setup lang="ts">
// actor.update: correcting an actor's display name, or giving a person an
// email or a login ID (a student or staff number) to sign in with. Only what
// changed is sent. Either can be changed, not removed; a new email withdraws
// the invitation waiting, which went to the old one. A login ID the person
// typed themselves, registering through a join link, is marked unverified,
// and one set here is vouched for. The kind and the platform role never
// change.
import AppTag from '@/components/AppTag.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import type { Actor } from '@/api/types'
import { useWrite } from '@/composables/useWrite'
import { loginIdProblem, MAX_LOGIN_ID } from '@/utils/loginId'
import { EMAIL_RE } from './adminShared'
import { signInState } from './signIn'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ actor: Actor }>()
const emit = defineEmits<{ saved: [actor: Actor] }>()
const { t } = useI18n()

const formRef = ref<FormInstance>()
const form = reactive({ display_name: '', email: '', login_id: '' })
const { run, pending } = useWrite('actor.update')

watch(
  open,
  (v) => {
    if (!v) return
    form.display_name = props.actor.display_name
    form.email = props.actor.email ?? ''
    form.login_id = props.actor.login_id ?? ''
  },
  { immediate: true },
)

/** A person has an email to sign in with; an agent is given none. */
const hasEmailField = computed(() => props.actor.kind === 'human' || !!props.actor.email)
/** Only a person has a login ID. */
const hasLoginIdField = computed(() => props.actor.kind === 'human')
const loginIdChanged = computed(() => !!form.login_id.trim() && form.login_id.trim() !== (props.actor.login_id ?? ''))
/** Saving the login ID they typed themselves, unchanged, vouches for it. */
const vouchesLoginId = computed(() => !!props.actor.login_id && props.actor.login_id_verified === false)
const emailChanged = computed(() => !!form.email.trim() && form.email.trim() !== (props.actor.email ?? ''))
/** Core compares emails without regard to case: only another address withdraws the invitation. */
const withdrawsInvite = computed(
  () =>
    emailChanged.value &&
    signInState(props.actor)?.invite === 'pending' &&
    form.email.trim().toLowerCase() !== (props.actor.email ?? '').toLowerCase(),
)

const rules = computed<FormRules>(() => ({
  display_name: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
        v && v.trim() ? cb() : cb(new Error(t('common.errors.required'))),
      trigger: 'blur',
    },
  ],
  login_id: [
    {
      // Once given, a login ID can be changed but not taken away.
      required: !!props.actor.login_id,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const p = loginIdProblem(v)
        if (p === 'empty') return props.actor.login_id ? cb(new Error(t('common.errors.required'))) : cb()
        return p ? cb(new Error(t(`admin.loginId.problem.${p}`, { n: MAX_LOGIN_ID }))) : cb()
      },
      trigger: 'blur',
    },
  ],
  email: [
    {
      // Once given, an email can be changed but not taken away.
      required: !!props.actor.email,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const e = (v ?? '').trim()
        if (!e) return props.actor.email ? cb(new Error(t('common.errors.required'))) : cb()
        // The form is checked only for an email being given or changed: one
        // Core took already (ops@localhost, say) is not this form's to refuse.
        if (e === props.actor.email) return cb()
        return EMAIL_RE.test(e) ? cb() : cb(new Error(t('common.errors.invalidEmail')))
      },
      trigger: 'blur',
    },
  ],
}))

/** Confirm the login ID they typed, as it is, when saving. */
const vouches = ref(false)
watch(open, (v) => v && (vouches.value = false))

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  const name = form.display_name.trim()
  const email = form.email.trim()
  const nameChanged = name !== props.actor.display_name
  const newEmail = hasEmailField.value && email && email !== (props.actor.email ?? '') ? email : undefined
  const loginId = form.login_id.trim()
  // A login ID changed, or one the person typed confirmed as it is: setting it vouches for it.
  const newLoginId =
    hasLoginIdField.value && loginId && (loginId !== (props.actor.login_id ?? '') || vouches.value)
      ? loginId
      : undefined
  if (!nameChanged && !newEmail && !newLoginId) {
    ElMessage({ type: 'info', message: t('admin.edit.nothingChanged') })
    open.value = false
    return
  }
  const out = await run(
    { actor_id: props.actor.id, display_name: nameChanged ? name : undefined, email: newEmail, login_id: newLoginId },
    { success: t('admin.edit.saved'), reasons: 'admin.loginId.refusal' },
  )
  if (!out) return
  open.value = false
  // A platform tool is never proposed: outside a course there is no ladder.
  if (out.status === 'executed') emit('saved', out.result)
}
</script>

<template>
  <el-dialog v-model="open" :title="t('admin.edit.title')" width="560px" destroy-on-close>
    <p class="app-form-hint edit-actor__intro">
      {{ hasEmailField ? t('admin.edit.intro') : t('admin.edit.introName') }}
    </p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('admin.edit.displayName')" prop="display_name">
        <el-input v-model="form.display_name" name="display_name" maxlength="200" autocomplete="off" />
      </el-form-item>
      <el-form-item v-if="hasEmailField" prop="email">
        <template #label>
          {{ t('admin.edit.email') }}
          <span v-if="!actor.email" class="app-muted">({{ t('common.labels.optional') }})</span>
        </template>
        <el-input v-model="form.email" name="email" type="email" maxlength="320" autocomplete="off" />
        <div class="app-form-hint edit-actor__block">{{ t('admin.edit.emailHint') }}</div>
      </el-form-item>
      <el-form-item v-if="hasLoginIdField" prop="login_id">
        <template #label>
          {{ t('admin.loginId.label') }}
          <span v-if="!actor.login_id" class="app-muted">({{ t('common.labels.optional') }})</span>
          <AppTag v-if="vouchesLoginId" tone="wait" class="edit-actor__tag">
            {{ t('admin.loginId.unverified') }}
          </AppTag>
        </template>
        <el-input
          v-model="form.login_id"
          name="login_id"
          :maxlength="MAX_LOGIN_ID"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <div class="app-form-hint edit-actor__block">{{ t('admin.loginId.editHint') }}</div>
        <el-checkbox v-if="vouchesLoginId && !loginIdChanged" v-model="vouches" class="edit-actor__vouch">
          {{ t('admin.loginId.vouch') }}
        </el-checkbox>
      </el-form-item>
      <el-alert
        v-if="emailChanged && actor.email"
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.edit.emailChanged')"
        class="edit-actor__alert"
      />
      <el-alert
        v-if="withdrawsInvite"
        type="warning"
        :closable="false"
        show-icon
        :title="t('admin.edit.withdrawsInvite')"
        class="edit-actor__alert"
      />
    </el-form>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" @click="submit">{{ t('common.actions.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.edit-actor__intro {
  margin: 0 0 16px;
}
.edit-actor__block {
  width: 100%;
}
.edit-actor__tag {
  margin-left: 6px;
}
.edit-actor__vouch {
  height: auto;
  white-space: normal;
}
.edit-actor__alert + .edit-actor__alert {
  margin-top: 8px;
}
</style>
