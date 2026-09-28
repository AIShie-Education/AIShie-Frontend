<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules, InputInstance } from 'element-plus'
import { ApiError, authMethods, health, ssoStartUrl, type SsoMethod } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { LOCALES } from '@/i18n'
import AppWordmark from '@/components/AppWordmark.vue'
import { errorMessage } from '@/composables/useErrors'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

const form = reactive({ email: '', password: '' })
const formRef = ref<FormInstance>()
const busy = ref(false)
// Why signing in did not work, kept as its cause and put into words when shown,
// so that a message already shown follows a change of language.
type Failure = { key: string } | { err: unknown }
const failure = shallowRef<Failure | null>(route.query.expired ? { key: 'auth.expired' } : null)
const error = computed(() =>
  !failure.value ? null : 'key' in failure.value ? t(failure.value.key) : errorMessage(failure.value.err),
)
const showToken = ref(false)
const token = ref('')
const tokenInput = ref<InputInstance>()
/** Continue was pressed with no token pasted. */
const tokenMissing = ref(false)
watch(token, () => (tokenMissing.value = false))
const version = ref<string | null>(null)
const serverDown = ref(false)

// Single sign-on as Core offers it (authMethods): the button appears once
// Core has said, and nothing else on the page waits for that.
const ssoMethod = shallowRef<SsoMethod | null>(null)
const ssoLabel = computed(() => ssoMethod.value?.label || t('auth.ssoDefault'))

const next = computed(() => {
  const n = route.query.next
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/'
})

// A field is checked when it is left after being typed in, and every field
// when signing in: not merely for being passed over (a password manager
// moving through the form, or a click elsewhere, before anything is typed).
// The rules are words in the page's language; changing it does not check the
// form again (validate-on-rule-change is off), it only puts a message already
// shown into the new language.
const touched = reactive({ email: false, password: false })
const submitted = ref(false)
function required(field: 'email' | 'password') {
  return {
    required: true,
    validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
      !v?.trim() && (submitted.value || touched[field]) ? cb(new Error(t('common.errors.required'))) : cb(),
    trigger: 'blur',
  }
}
const rules = computed<FormRules>(() => ({
  email: [required('email')],
  password: [required('password')],
}))
watch(
  () => ui.locale,
  () =>
    nextTick(() => {
      const shown = (['email', 'password'] as const).filter(
        (p) => formRef.value?.getField(p)?.validateState === 'error',
      )
      if (shown.length) void formRef.value?.validateField([...shown]).catch(() => undefined)
    }),
)

onMounted(async () => {
  void authMethods().then((m) => (ssoMethod.value = m.sso))
  try {
    const h = await health()
    version.value = h?.version ?? null
    serverDown.value = !h || h.status !== 'ok'
  } catch {
    serverDown.value = true
  }
})

/**
 * Where to go once signed in. If this page has held someone else (they signed
 * out, or their session lapsed, and now another person or an agent's token
 * signs in here), load the page again: views cache names and look-ups, and
 * only a fresh page is sure to hold nothing of the caller before. The button
 * stays busy until it has gone.
 */
function proceed(): boolean {
  if (session.startsAfresh()) {
    window.location.assign(router.resolve(next.value).href)
    return true
  }
  router.replace(next.value)
  return false
}

async function signIn() {
  submitted.value = true
  if (!(await formRef.value?.validate().catch(() => false))) return
  busy.value = true
  failure.value = null
  let leaving = false
  try {
    await session.signInWithPassword(form.email.trim(), form.password)
    leaving = proceed()
  } catch (e) {
    failure.value = e instanceof ApiError && e.isUnauthenticated ? { key: 'auth.failed' } : { err: e }
  } finally {
    if (!leaving) busy.value = false
  }
}

async function signInWithToken() {
  if (!token.value.trim()) {
    // Said beside the field (an alert, read out) and the field is focused, so
    // that pressing again, which adds no new alert, still says what is wrong.
    tokenMissing.value = true
    tokenInput.value?.focus()
    return
  }
  busy.value = true
  failure.value = null
  let leaving = false
  try {
    await session.signInWithToken(token.value)
    leaving = proceed()
  } catch (e) {
    failure.value = { err: e }
  } finally {
    if (!leaving) busy.value = false
  }
}

function sso() {
  if (!ssoMethod.value) return
  // The full address of the page to come back to (with the app's base path);
  // ssoStartUrl makes it absolute when Core is on another origin.
  window.location.href = ssoStartUrl(router.resolve(next.value).href, ssoMethod.value.start)
}
</script>

<template>
  <div class="login">
    <div class="login__lang">
      <el-select v-model="ui.locale" size="small" style="width: 120px">
        <el-option v-for="l in LOCALES" :key="l.value" :value="l.value" :label="l.label" />
      </el-select>
    </div>
    <div class="login__card">
      <div class="login__brand">
        <AppWordmark class="login__wordmark" decorative />
        <h1 class="login__title">{{ t('auth.welcome') }}</h1>
        <p class="login__tagline">{{ t('common.tagline') }}</p>
      </div>

      <el-alert v-if="serverDown" type="warning" :title="t('auth.serverDown')" :closable="false" show-icon class="login__alert" />
      <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="login__alert" />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :validate-on-rule-change="false"
        label-position="top"
        @submit.prevent="signIn"
      >
        <el-form-item :label="t('auth.email')" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            autocomplete="username"
            size="large"
            name="email"
            @input="touched.email = true"
          />
        </el-form-item>
        <el-form-item :label="t('auth.password')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            show-password
            size="large"
            name="password"
            @input="touched.password = true"
          />
        </el-form-item>
        <el-button type="primary" size="large" native-type="submit" :loading="busy" class="login__submit">
          {{ t('auth.signIn') }}
        </el-button>
      </el-form>

      <template v-if="ssoMethod">
        <el-divider>{{ t('auth.or') }}</el-divider>
        <el-button size="large" class="login__submit login__sso" @click="sso">{{ t('auth.sso', { provider: ssoLabel }) }}</el-button>
      </template>

      <div class="login__token">
        <el-button link type="info" @click="showToken = !showToken">
          <el-icon><Key /></el-icon>
          {{ t('auth.token') }}
        </el-button>
        <el-collapse-transition>
          <form v-show="showToken" class="login__token-form" @submit.prevent="signInWithToken">
            <p id="login-token-hint" class="app-form-hint">{{ t('auth.tokenHint') }}</p>
            <el-input
              ref="tokenInput"
              v-model="token"
              type="password"
              show-password
              :aria-label="t('auth.tokenLabel')"
              :aria-invalid="tokenMissing || undefined"
              :aria-describedby="tokenMissing ? 'login-token-hint login-token-missing' : 'login-token-hint'"
              :placeholder="t('auth.tokenPlaceholder')"
              autocomplete="off"
            />
            <div v-if="tokenMissing" id="login-token-missing" role="alert" class="login__token-missing">
              {{ t('auth.tokenMissing') }}
            </div>
            <el-button native-type="submit" type="primary" plain :loading="busy">{{ t('auth.tokenSignIn') }}</el-button>
          </form>
        </el-collapse-transition>
      </div>

      <p v-if="version" class="login__version">{{ t('auth.serverVersion', { version }) }}</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(1200px 600px at 10% -10%, var(--app-indigo-tint), transparent 60%),
    radial-gradient(900px 500px at 110% 110%, color-mix(in srgb, var(--app-light) 16%, transparent), transparent 60%),
    var(--app-ground);
  position: relative;
}
.login__lang {
  position: absolute;
  top: 16px;
  right: 16px;
}
.login__card {
  width: 100%;
  max-width: 420px;
  background: var(--app-card);
  border: 1px solid var(--app-line);
  border-radius: 14px;
  padding: 32px 28px 20px;
  box-shadow: var(--app-shadow-raised);
}
.login__brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 24px;
}
.login__wordmark {
  height: 34px;
  margin-bottom: 18px;
}
.login__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
}
.login__tagline {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.login__alert {
  margin-bottom: 16px;
}
.login__submit {
  width: 100%;
}
.login__token {
  margin-top: 16px;
}
.login__token-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.login__token-missing {
  margin-top: -4px;
  font-size: 12px;
  color: var(--el-color-danger);
}
.login__version {
  margin: 20px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
