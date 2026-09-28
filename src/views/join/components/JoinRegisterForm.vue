<script setup lang="ts">
// Creating an account through an invite link: a name, and what they will sign
// in with, and a password, typed twice. A link kept to email domains asks for
// an email (email_required); any other asks for their student number (a login
// ID), which is what they sign in with, and takes an email too if they have
// one. Each is held to Core's rules before Core is asked (a name of 1 to 200
// characters, a student number of 1 to 64 letters, digits, dots, hyphens and
// underscores, a whole email address at a domain the link takes, a password
// of 10 to 1024 bytes), and the rules are said on the form; Core decides. The
// page around it sends it.
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FormInstance, FormRules } from 'element-plus'
import { useUiStore } from '@/stores/ui'
import type { JoinRegistration } from '@/api/http'
import { MAX_LOGIN_ID } from '@/utils/loginId'
import { emailProblem, loginIdProblem, MAX_NAME, nameProblem, passwordProblems, type Problem } from '../join'

const props = withDefaults(
  defineProps<{
    /** The email domains the link is kept to; none for any. */
    domains: string[]
    /** Whether the link asks for an email; otherwise a student number, with an email or without. */
    emailRequired?: boolean
    busy?: boolean
  }>(),
  { emailRequired: true },
)
const emit = defineEmits<{ submit: [form: JoinRegistration] }>()
const { t } = useI18n()
const ui = useUiStore()

const formRef = ref<FormInstance>()
const form = reactive({ name: '', loginId: '', email: '', password: '', repeat: '' })
const domainList = computed(() => props.domains.map((d) => `@${d}`).join(', '))

/** A rule that says the problem check finds, in the page's language. */
function rule(check: (v: string) => Problem) {
  return {
    required: true,
    validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
      const p = check(v ?? '')
      if (p) cb(new Error(t(p.key, p.args ?? {})))
      else cb()
    },
    trigger: 'blur',
  }
}
const rules = computed<FormRules>(() => ({
  name: [rule(nameProblem)],
  loginId: props.emailRequired ? [] : [rule(loginIdProblem)],
  email: [
    {
      ...rule((v) => emailProblem(v, props.domains, { optional: !props.emailRequired })),
      required: props.emailRequired,
    },
  ],
  password: [rule((v) => passwordProblems(v, form.repeat).password)],
  repeat: [rule((v) => passwordProblems(form.password, v).repeat)],
}))

// The rules are words in the page's language; changing it does not check the
// form again, it only puts a message already shown into the new language.
watch(
  () => ui.locale,
  () =>
    nextTick(() => {
      const shown = (['name', 'loginId', 'email', 'password', 'repeat'] as const).filter(
        (p) => formRef.value?.getField(p)?.validateState === 'error',
      )
      if (shown.length) void formRef.value?.validateField([...shown]).catch(() => undefined)
    }),
)

async function submit() {
  if (props.busy) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  const email = form.email.trim()
  emit(
    'submit',
    props.emailRequired
      ? { display_name: form.name.trim(), email, password: form.password }
      : {
          display_name: form.name.trim(),
          login_id: form.loginId.trim(),
          ...(email ? { email } : {}),
          password: form.password,
        },
  )
}

/** Forgets the password typed, once it has been used (or refused for good). */
function clearPasswords() {
  form.password = ''
  form.repeat = ''
  formRef.value?.clearValidate(['password', 'repeat'])
}
defineExpose({ clearPasswords })
</script>

<template>
  <el-form
    ref="formRef"
    :model="form"
    :rules="rules"
    :validate-on-rule-change="false"
    label-position="top"
    class="join-register"
    @submit.prevent="submit"
  >
    <el-form-item :label="t('join.page.displayName')" prop="name">
      <el-input v-model="form.name" name="name" autocomplete="name" :maxlength="MAX_NAME" />
      <div class="app-form-hint">{{ t('join.page.displayNameHint') }}</div>
    </el-form-item>
    <el-form-item v-if="!emailRequired" :label="t('join.page.loginId')" prop="loginId">
      <el-input
        v-model="form.loginId"
        name="login_id"
        autocomplete="username"
        autocapitalize="off"
        spellcheck="false"
        :maxlength="MAX_LOGIN_ID"
      />
      <div class="app-form-hint">{{ t('join.page.loginIdHint') }}</div>
    </el-form-item>
    <el-form-item prop="email">
      <template #label>
        {{ t('join.page.email') }}
        <span v-if="!emailRequired" class="app-muted">({{ t('common.labels.optional') }})</span>
      </template>
      <el-input
        v-model="form.email"
        name="email"
        type="email"
        :autocomplete="emailRequired ? 'email' : 'off'"
        inputmode="email"
      />
      <div class="app-form-hint">
        {{
          domains.length
            ? t('join.page.emailDomainHint', { domains: domainList })
            : emailRequired
              ? t('join.page.emailHint')
              : t('join.page.emailOptionalHint')
        }}
      </div>
    </el-form-item>
    <el-form-item :label="t('join.page.password')" prop="password">
      <el-input v-model="form.password" type="password" show-password name="password" autocomplete="new-password" />
      <div class="app-form-hint">{{ t('join.page.rule') }}</div>
    </el-form-item>
    <el-form-item :label="t('join.page.repeat')" prop="repeat">
      <el-input v-model="form.repeat" type="password" show-password name="repeat" autocomplete="new-password" />
    </el-form-item>
    <el-button type="primary" size="large" native-type="submit" :loading="busy" class="join-register__submit">
      {{ t('join.page.submitRegister') }}
    </el-button>
  </el-form>
</template>

<style scoped>
.join-register__submit {
  width: 100%;
  margin-top: 4px;
}
</style>
