<script setup lang="ts">
// Where someone whose password someone else set comes first: an instructor
// gave them a temporary one (member.reset_password), and Core refuses every
// call of theirs but setting their own (credential.set_password,
// password_change_required) until they have. The page offers that, and
// signing out, and nothing else; once it is set they go on where they were
// going. Core decides: a password that is the temporary one again
// (password_unchanged), or outside the rules, is refused and said in words.
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ApiError, newIdempotencyKey, write } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { LOCALES } from '@/i18n'
import AppWordmark from '@/components/AppWordmark.vue'
import { passwordProblem } from '@/utils/password'
import { weakPasswordRefusal } from './changePassword'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

const formRef = ref<FormInstance>()
const form = reactive({ password: '', repeat: '' })
const busy = ref(false)
const leaving = ref(false)
/** Why it did not go through, kept as its cause and put into words when shown. */
const failure = shallowRef<unknown>(null)
const failureText = computed(() => {
  const e = failure.value
  if (!e) return null
  if (e instanceof ApiError && e.details?.reason === 'password_unchanged') return t('auth.change.unchanged')
  if (weakPasswordRefusal(e)) return t('auth.change.weak')
  return errorMessage(e)
})

const next = computed(() => {
  const n = route.query.next
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/'
})

const rules = computed<FormRules>(() => ({
  password: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const p = passwordProblem(v ?? '')
        if (!v) return cb(new Error(t('common.errors.required')))
        if (p === 'short') return cb(new Error(t('auth.invite.tooShort')))
        if (p === 'long') return cb(new Error(t('auth.invite.tooLong')))
        cb()
      },
      trigger: 'blur',
    },
  ],
  repeat: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (!v) return cb(new Error(t('common.errors.required')))
        return v !== form.password ? cb(new Error(t('auth.invite.mismatch'))) : cb()
      },
      trigger: 'blur',
    },
  ],
}))
// The rules are words in the page's language; a message already shown follows a change of it.
watch(
  () => ui.locale,
  () =>
    nextTick(() => {
      const shown = (['password', 'repeat'] as const).filter(
        (p) => formRef.value?.getField(p)?.validateState === 'error',
      )
      if (shown.length) void formRef.value?.validateField([...shown]).catch(() => undefined)
    }),
)

/** One key for as long as the same password is tried again: Core sets it once. */
let key: string | null = null
let keyFor: string | null = null

async function submit() {
  if (busy.value) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  busy.value = true
  failure.value = null
  if (keyFor !== form.password) {
    key = newIdempotencyKey()
    keyFor = form.password
  }
  try {
    await write('credential.set_password', { password: form.password }, { idempotencyKey: key! })
    key = keyFor = null
    form.password = ''
    form.repeat = ''
    leaving.value = true
    await session.passwordChanged().catch(() => undefined)
    // As a sign-in does: a page that has held someone else is loaded afresh.
    if (session.startsAfresh()) window.location.assign(router.resolve(next.value).href)
    else await router.replace(next.value)
  } catch (e) {
    // Core answered: the same key would only be answered the same way.
    if (!(e instanceof ApiError) || !(e.isNetwork || e.status >= 500)) key = keyFor = null
    failure.value = e
    leaving.value = false
  } finally {
    busy.value = false
  }
}

async function signOut() {
  leaving.value = true
  await session.signOut().catch(() => undefined)
  await router.replace({ name: 'login' })
  leaving.value = false
}
</script>

<template>
  <div class="app-auth-page change-pw">
    <div class="app-auth-page__lang">
      <el-select v-model="ui.locale" size="small" style="width: 120px" :aria-label="t('common.nav.language')">
        <el-option v-for="l in LOCALES" :key="l.value" :value="l.value" :label="l.label" :lang="l.value" />
      </el-select>
    </div>
    <main class="app-auth-page__card" :aria-busy="leaving">
      <div class="change-pw__brand">
        <AppWordmark class="app-auth-page__wordmark change-pw__wordmark" decorative />
        <h1 class="change-pw__title">{{ t('auth.change.title') }}</h1>
        <p class="change-pw__lead">{{ t('auth.change.lead') }}</p>
      </div>
      <el-alert
        v-if="failureText"
        type="error"
        :title="failureText"
        :closable="false"
        show-icon
        class="change-pw__alert"
      />
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :validate-on-rule-change="false"
        label-position="top"
        :disabled="busy || leaving"
        @submit.prevent="submit"
      >
        <!-- For a password manager: the account whose password this is, which Core will not say yet. -->
        <input
          type="text"
          name="username"
          autocomplete="username"
          class="change-pw__hidden"
          tabindex="-1"
          aria-hidden="true"
        />
        <el-form-item :label="t('auth.change.password')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            name="new-password"
            autocomplete="new-password"
            size="large"
          />
          <div class="app-form-hint">{{ t('auth.change.rule') }}</div>
        </el-form-item>
        <el-form-item :label="t('auth.invite.repeat')" prop="repeat">
          <el-input
            v-model="form.repeat"
            type="password"
            show-password
            name="repeat"
            autocomplete="new-password"
            size="large"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          native-type="submit"
          :loading="busy || leaving"
          class="change-pw__submit"
        >
          {{ t('auth.change.submit') }}
        </el-button>
      </el-form>
      <p class="change-pw__out">
        {{ t('auth.change.notNow') }}
        <el-button link type="primary" :disabled="leaving" @click="signOut">{{
          t('common.actions.signOut')
        }}</el-button>
      </p>
    </main>
  </div>
</template>

<style scoped>
.change-pw__brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
}
.change-pw__wordmark {
  align-self: flex-start;
}
.change-pw__title {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
}
.change-pw__lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.change-pw__alert {
  margin-bottom: 16px;
}
.change-pw__submit {
  width: 100%;
}
.change-pw__out {
  margin: 16px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.change-pw__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
