<script setup lang="ts">
// Where an invitation link lands (actor.invite). The token is in the
// fragment, #token=aisinv_…, which the browser sends to no server; each time
// one arrives it is read and taken out of the address, so that it stays in
// neither the address bar nor the history. The person chooses a password,
// and POST /v1/auth/invite sets it and signs this browser in as them.
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ApiError } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { LOCALES } from '@/i18n'
import AppWordmark from '@/components/AppWordmark.vue'
import { tokenFromHash } from '@/utils/invitation'
import { passwordProblem } from '@/utils/password'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()

const formRef = ref<FormInstance>()
const form = reactive({ password: '', repeat: '' })
const busy = ref(false)
const leaving = ref(false)
/**
 * Why setting the password did not work, kept as its cause and put into words
 * when shown, so that a message already shown follows a change of language.
 * `wait`: Core asked for a pause (429), which is said with how long.
 */
const failure = shallowRef<{ err: ApiError; wait: true } | { err: unknown } | null>(null)
/** Core refused the invitation: nothing more can be done with it. */
const invalid = ref(false)
/** The email they sign in with from now on, once the password is set. */
const doneEmail = ref<string | null>(null)

/** The invitation, read before the address loses it. */
const token = ref<string | null>(null)

// A link opened in a tab already on this page (another link pasted in, say)
// changes only the fragment, and this page stays: each new token starts it
// afresh. The token is then taken out of the address, through the router,
// which writes it with history.replaceState, so that its own record of where
// this page is loses the token too. The address left without one keeps the
// token already read.
watch(
  () => route.hash,
  (hash) => {
    const found = tokenFromHash(hash)
    if (!found) return
    token.value = found
    invalid.value = false
    failure.value = null
    doneEmail.value = null
    form.password = ''
    form.repeat = ''
    formRef.value?.clearValidate()
    void router.replace({ query: route.query, hash: '' })
  },
  { immediate: true },
)

/** Who this browser is signed in as, whom accepting would sign out. */
const signedInAs = computed(() => (session.status === 'signedIn' ? (session.me?.display_name ?? null) : null))

const rules = computed<FormRules>(() => ({
  password: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        const problem = passwordProblem(v ?? '')
        if (!v) cb(new Error(t('common.errors.required')))
        else if (problem === 'short') cb(new Error(t('auth.invite.tooShort')))
        else if (problem === 'long') cb(new Error(t('auth.invite.tooLong')))
        else cb()
      },
      trigger: 'blur',
    },
  ],
  repeat: [
    {
      required: true,
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (!v) cb(new Error(t('common.errors.required')))
        else if (v !== form.password) cb(new Error(t('auth.invite.mismatch')))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}))

// The rules are words in the page's language; changing it does not check the
// form again (validate-on-rule-change is off), it only puts a message already
// shown into the new language.
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

function waitMessage(e: ApiError): string {
  const n = Number(e.details?.retry_after_seconds)
  return Number.isFinite(n) && n > 0 ? t('auth.invite.wait', { n }, n) : errorMessage(e)
}

const error = computed(() =>
  !failure.value ? null : 'wait' in failure.value ? waitMessage(failure.value.err) : errorMessage(failure.value.err),
)

async function submit() {
  const invitation = token.value
  if (!invitation || busy.value) return
  if (!(await formRef.value?.validate().catch(() => false))) return
  busy.value = true
  failure.value = null
  try {
    const out = await session.signInWithInvite(invitation, form.password)
    form.password = ''
    form.repeat = ''
    doneEmail.value = out.email
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) invalid.value = true
    else if (e instanceof ApiError && e.status === 429) failure.value = { err: e, wait: true }
    else failure.value = { err: e }
  } finally {
    busy.value = false
  }
}

/**
 * Home, signed in. If this page has held someone else, load it again, as the
 * sign-in page does: views cache names and look-ups, and only a fresh page is
 * sure to hold nothing of the caller before.
 */
function proceed() {
  leaving.value = true
  if (session.startsAfresh()) window.location.assign(router.resolve({ name: 'home' }).href)
  else void router.replace({ name: 'home' })
}
</script>

<template>
  <div class="welcome">
    <div class="welcome__lang">
      <el-select v-model="ui.locale" size="small" style="width: 120px" :aria-label="t('common.nav.language')">
        <el-option v-for="l in LOCALES" :key="l.value" :value="l.value" :label="l.label" />
      </el-select>
    </div>
    <div class="welcome__card">
      <div class="welcome__brand">
        <AppWordmark class="welcome__wordmark" decorative />
        <h1 class="welcome__title">{{ t('auth.invite.title') }}</h1>
        <p class="welcome__tagline">{{ t('common.tagline') }}</p>
      </div>

      <el-result v-if="doneEmail" icon="success" :title="t('auth.invite.doneTitle')" class="welcome__result">
        <template #sub-title>
          <p class="welcome__done">{{ t('auth.invite.done', { email: doneEmail }) }}</p>
        </template>
        <template #extra>
          <el-button type="primary" size="large" :loading="leaving" @click="proceed">
            {{ t('auth.invite.continue') }}
          </el-button>
        </template>
      </el-result>

      <el-result
        v-else-if="!token || invalid"
        icon="warning"
        :title="invalid ? t('auth.invite.invalidTitle') : t('auth.invite.incompleteTitle')"
        :sub-title="invalid ? t('auth.invite.invalid') : t('auth.invite.incomplete')"
        class="welcome__result"
      >
        <template #extra>
          <el-button v-if="signedInAs" type="primary" :loading="leaving" @click="proceed">
            {{ t('auth.invite.continue') }}
          </el-button>
          <router-link v-else :to="{ name: 'login' }">
            <el-button type="primary">{{ t('auth.invite.signIn') }}</el-button>
          </router-link>
        </template>
      </el-result>

      <template v-else>
        <p class="welcome__intro">{{ t('auth.invite.intro') }}</p>
        <el-alert
          v-if="signedInAs"
          type="warning"
          :title="t('auth.invite.signedInAs', { name: signedInAs })"
          :closable="false"
          show-icon
          class="welcome__alert"
        />
        <el-alert v-if="error" type="error" :title="error" :closable="false" show-icon class="welcome__alert" />

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          :validate-on-rule-change="false"
          label-position="top"
          @submit.prevent="submit"
        >
          <el-form-item :label="t('auth.invite.password')" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              name="password"
              autocomplete="new-password"
              maxlength="1024"
              size="large"
            />
            <div class="app-form-hint">{{ t('auth.invite.rule') }}</div>
          </el-form-item>
          <el-form-item :label="t('auth.invite.repeat')" prop="repeat">
            <el-input
              v-model="form.repeat"
              type="password"
              show-password
              name="repeat"
              autocomplete="new-password"
              maxlength="1024"
              size="large"
            />
          </el-form-item>
          <el-button type="primary" size="large" native-type="submit" :loading="busy" class="welcome__submit">
            {{ t('auth.invite.submit') }}
          </el-button>
        </el-form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 16px 24px;
  background:
    radial-gradient(1200px 600px at 10% -10%, var(--app-indigo-tint), transparent 60%),
    radial-gradient(900px 500px at 110% 110%, color-mix(in srgb, var(--app-light) 16%, transparent), transparent 60%),
    var(--app-ground);
  position: relative;
}
.welcome__lang {
  position: absolute;
  top: 16px;
  right: 16px;
}
.welcome__card {
  width: 100%;
  max-width: 440px;
  background: var(--app-card);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-card);
  padding: 32px 28px 24px;
  box-shadow: var(--app-shadow-raised);
}
.welcome__brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 20px;
}
.welcome__wordmark {
  height: 34px;
  margin-bottom: 18px;
}
.welcome__title {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
}
.welcome__tagline {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.welcome__intro {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.welcome__alert {
  margin-bottom: 16px;
}
.welcome__submit {
  width: 100%;
}
.welcome__result {
  padding: 8px 0 0;
}
.welcome__done {
  margin: 0;
  line-height: 1.6;
  word-break: break-word;
}
@media (max-width: 480px) {
  .welcome__card {
    padding: 24px 18px 20px;
  }
}
</style>
