<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { acceptsLoginId, ApiError, authMethods, health, ssoButtons, ssoStartUrl, type SsoMethod } from '@/api/http'
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

// The account's name: an email, or where Core takes one a login ID, a student
// or staff number (authMethods' passwordAccepts); as before when Core does not say.
const form = reactive({ login: '', password: '' })
const formRef = ref<FormInstance>()
const busy = ref(false)
// Why signing in did not work, kept as its cause and put into words when shown,
// so that a message already shown follows a change of language.
type Failure = { key: string } | { err: unknown }
const failure = shallowRef<Failure | null>(route.query.expired ? { key: 'auth.expired' } : null)
const error = computed(() =>
  !failure.value ? null : 'key' in failure.value ? t(failure.value.key) : errorMessage(failure.value.err),
)
/** Core takes a login ID as well as an email: the field says so, and the name goes as `login`. */
const byLoginId = ref(false)
const serverDown = ref(false)

// Single sign-on as Core offers it (authMethods): a button for each identity
// provider offered, in Core's order (or the one a Core from before several
// offers). Where there is one, it is how the school's people sign in: the
// buttons come first, the first of them the page's one primary, and the
// password form is behind "Use your student number and password instead".
// The page waits a moment for Core to say (METHODS_WAIT), so as not to show
// the form and then take it away; after that the form is offered, and a
// provider Core names later does not take away a form already typed in, or
// one the person has moved into.
const ssoMethods = shallowRef<SsoMethod[]>([])
const ssoLabel = (m: SsoMethod) => m.label || t('auth.ssoDefault')
const METHODS_WAIT = 400
const methodsSettled = ref(false)
/** The person chose to sign in with a password where single sign-on is offered. */
const passwordChosen = ref(false)
const ssoFirst = computed(() => ssoMethods.value.length > 0 && !passwordChosen.value)
function usePassword() {
  passwordChosen.value = true
  void nextTick(() => (document.querySelector('input[name="login"]') as HTMLInputElement | null)?.focus())
}
/** Back to single sign-on: focus goes to its first button, as the form it was in is hidden. */
function useSso() {
  passwordChosen.value = false
  void nextTick(() => (document.querySelector('.login__sso') as HTMLElement | null)?.focus())
}
/** The person is in the password form: typing in it, or with focus in one of its fields. */
function inForm(): boolean {
  return touched.login || touched.password || !!document.activeElement?.closest('.login__form')
}

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
const touched = reactive({ login: false, password: false })
const submitted = ref(false)
function required(field: 'login' | 'password') {
  return {
    required: true,
    validator: (_r: unknown, v: string, cb: (e?: Error) => void) =>
      !v?.trim() && (submitted.value || touched[field]) ? cb(new Error(t('common.errors.required'))) : cb(),
    trigger: 'blur',
  }
}
const rules = computed<FormRules>(() => ({
  login: [required('login')],
  password: [required('password')],
}))
watch(
  () => ui.locale,
  () =>
    nextTick(() => {
      const shown = (['login', 'password'] as const).filter(
        (p) => formRef.value?.getField(p)?.validateState === 'error',
      )
      if (shown.length) void formRef.value?.validateField([...shown]).catch(() => undefined)
    }),
)

onMounted(async () => {
  const wait = setTimeout(() => (methodsSettled.value = true), METHODS_WAIT)
  void authMethods()
    .then((m) => {
      if (methodsSettled.value && inForm()) passwordChosen.value = true
      ssoMethods.value = ssoButtons(m)
      byLoginId.value = acceptsLoginId(m)
    })
    .catch(() => undefined)
    .finally(() => {
      clearTimeout(wait)
      methodsSettled.value = true
    })
  try {
    // Whether it answers; which version it runs is in the account menu's About, once signed in.
    const h = await health()
    serverDown.value = !h || h.status !== 'ok'
  } catch {
    serverDown.value = true
  }
})

/**
 * Where to go once signed in. If this page has held someone else (they signed
 * out, or their session lapsed, and now another person signs in here), load
 * the page again: views cache names and look-ups, and
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

/**
 * The password signed in with is one someone else set: the person sets their
 * own first, and is then taken where they were going.
 */
function changePasswordFirst() {
  void router.replace({ name: 'change-password', query: next.value !== '/' ? { next: next.value } : {} })
}

async function signIn() {
  submitted.value = true
  if (!(await formRef.value?.validate().catch(() => false))) return
  busy.value = true
  failure.value = null
  let leaving = false
  try {
    const out = await session.signInWithPassword(form.login.trim(), form.password, { asLogin: byLoginId.value })
    form.password = ''
    if (out.passwordChangeRequired) {
      leaving = true
      changePasswordFirst()
    } else {
      leaving = proceed()
    }
  } catch (e) {
    failure.value =
      e instanceof ApiError && e.isUnauthenticated
        ? { key: byLoginId.value ? 'auth.failedLogin' : 'auth.failed' }
        : { err: e }
  } finally {
    if (!leaving) busy.value = false
  }
}

function sso(m: SsoMethod) {
  // The full address of the page to come back to (with the app's base path);
  // ssoStartUrl makes it absolute when Core is on another origin.
  window.location.href = ssoStartUrl(router.resolve(next.value).href, m.start)
}
</script>

<template>
  <div class="app-auth-page login">
    <div class="app-auth-page__lang">
      <el-select v-model="ui.locale" size="small" style="width: 120px" :aria-label="t('common.nav.language')">
        <el-option v-for="l in LOCALES" :key="l.value" :value="l.value" :label="l.label" />
      </el-select>
    </div>
    <main class="app-auth-page__card login__card">
      <div class="login__brand">
        <AppWordmark class="app-auth-page__wordmark login__wordmark" />
        <p class="login__tagline">{{ t('common.tagline') }}</p>
        <h1 class="login__title">{{ t('auth.title') }}</h1>
      </div>

      <el-alert v-if="serverDown" type="warning" :title="t('auth.serverDown')" :closable="false" show-icon class="login__alert" />
      <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="login__alert" />

      <div v-if="!methodsSettled" class="login__waiting" aria-hidden="true" />
      <div v-else-if="ssoFirst" class="login__sso-list">
        <el-button
          v-for="(m, i) in ssoMethods"
          :key="m.start"
          :type="i === 0 ? 'primary' : undefined"
          size="large"
          class="login__submit login__sso"
          @click="sso(m)"
        >
          {{ t('auth.sso', { provider: ssoLabel(m) }) }}
        </el-button>
        <el-button link type="primary" class="login__other login__use-password" @click="usePassword">
          {{ byLoginId ? t('auth.usePassword') : t('auth.useEmailPassword') }}
        </el-button>
      </div>

      <el-form
        v-show="methodsSettled && !ssoFirst"
        ref="formRef"
        :model="form"
        :rules="rules"
        :validate-on-rule-change="false"
        label-position="top"
        class="login__form"
        @submit.prevent="signIn"
      >
        <el-form-item :label="byLoginId ? t('auth.loginOrEmail') : t('auth.email')" prop="login">
          <el-input
            v-model="form.login"
            :type="byLoginId ? 'text' : 'email'"
            autocomplete="username"
            autocapitalize="off"
            spellcheck="false"
            size="large"
            name="login"
            @input="touched.login = true"
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
        <el-button
          v-if="ssoMethods.length"
          link
          type="primary"
          class="login__other login__use-sso"
          @click="useSso"
        >
          {{ t('auth.useSso') }}
        </el-button>
      </el-form>
    </main>
  </div>
</template>

<style scoped>
.login__brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin-bottom: 24px;
}
.login__wordmark {
  margin-bottom: 4px;
}
.login__tagline {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--app-ink-3);
}
.login__title {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
}
.login__alert {
  margin-bottom: 16px;
}
.login__waiting {
  min-height: 96px;
}
.login__submit {
  width: 100%;
}
.login__sso-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* The link below keeps its own margins: centred under the buttons, as it is under the password form. */
.login__sso-list .el-button + .el-button:not(.login__other) {
  margin-left: 0;
}
/* A long name keeps to the card's width. */
.login__sso :deep(span) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.login__other {
  display: flex;
  width: fit-content;
  margin: 16px auto 0;
}
</style>
