<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ApiError, health, ssoStartUrl } from '@/api/http'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { LOCALES } from '@/i18n'
import { errorMessage } from '@/composables/useErrors'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

const form = reactive({ email: '', password: '' })
const formRef = ref<FormInstance>()
const busy = ref(false)
const error = ref<string | null>(route.query.expired ? t('auth.expired') : null)
const showToken = ref(false)
const token = ref('')
const version = ref<string | null>(null)
const serverDown = ref(false)

const ssoEnabled = import.meta.env.VITE_SSO_ENABLED === 'true'
const ssoLabel = import.meta.env.VITE_SSO_LABEL || t('auth.ssoDefault')

const next = computed(() => {
  const n = route.query.next
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/'
})

const rules = computed<FormRules>(() => ({
  email: [{ required: true, message: t('common.errors.required'), trigger: 'blur' }],
  password: [{ required: true, message: t('common.errors.required'), trigger: 'blur' }],
}))

onMounted(async () => {
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
  if (!(await formRef.value?.validate().catch(() => false))) return
  busy.value = true
  error.value = null
  let leaving = false
  try {
    await session.signInWithPassword(form.email.trim(), form.password)
    leaving = proceed()
  } catch (e) {
    error.value = e instanceof ApiError && e.isUnauthenticated ? t('auth.failed') : errorMessage(e)
  } finally {
    if (!leaving) busy.value = false
  }
}

async function signInWithToken() {
  if (!token.value.trim()) return
  busy.value = true
  error.value = null
  let leaving = false
  try {
    await session.signInWithToken(token.value)
    leaving = proceed()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    if (!leaving) busy.value = false
  }
}

function sso() {
  // The full address of the page to come back to (with the app's base path);
  // ssoStartUrl makes it absolute when Core is on another origin.
  window.location.href = ssoStartUrl(router.resolve(next.value).href)
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
        <img src="/favicon.svg" alt="" width="44" height="44" />
        <div>
          <h1 class="login__title">{{ t('auth.welcome') }}</h1>
          <p class="login__tagline">{{ t('common.tagline') }}</p>
        </div>
      </div>

      <el-alert v-if="serverDown" type="warning" :title="t('auth.serverDown')" :closable="false" show-icon class="login__alert" />
      <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="login__alert" />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="signIn">
        <el-form-item :label="t('auth.email')" prop="email">
          <el-input v-model="form.email" type="email" autocomplete="username" size="large" name="email" />
        </el-form-item>
        <el-form-item :label="t('auth.password')" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            show-password
            size="large"
            name="password"
          />
        </el-form-item>
        <el-button type="primary" size="large" native-type="submit" :loading="busy" class="login__submit">
          {{ t('auth.signIn') }}
        </el-button>
      </el-form>

      <template v-if="ssoEnabled">
        <el-divider>{{ t('auth.or') }}</el-divider>
        <el-button size="large" class="login__submit" @click="sso">{{ t('auth.sso', { provider: ssoLabel }) }}</el-button>
      </template>

      <div class="login__token">
        <el-button link type="info" @click="showToken = !showToken">
          <el-icon><Key /></el-icon>
          {{ t('auth.token') }}
        </el-button>
        <el-collapse-transition>
          <form v-show="showToken" class="login__token-form" @submit.prevent="signInWithToken">
            <p class="app-form-hint">{{ t('auth.tokenHint') }}</p>
            <el-input v-model="token" type="password" show-password :placeholder="t('auth.tokenPlaceholder')" autocomplete="off" />
            <el-button native-type="submit" :loading="busy" :disabled="!token.trim()">{{ t('auth.tokenSignIn') }}</el-button>
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
    radial-gradient(1200px 600px at 10% -10%, var(--el-color-primary-light-9), transparent 60%),
    radial-gradient(900px 500px at 110% 110%, var(--el-color-danger-light-9), transparent 60%),
    var(--app-page-bg);
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
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  padding: 32px 28px 20px;
  box-shadow: var(--el-box-shadow-light);
}
.login__brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
.login__title {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
}
.login__tagline {
  margin: 4px 0 0;
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
.login__version {
  margin: 20px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
</style>
