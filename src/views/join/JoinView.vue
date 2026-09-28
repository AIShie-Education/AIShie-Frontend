<script setup lang="ts">
// Where a course's invite link lands: /join/<token>. Anyone may open it,
// signed in or not, on a phone as often as not (the link is a QR code on a
// slide). It says which course the link is to and whether it can be joined
// now; a person signed in joins at once, as a student, and anyone else signs
// in and comes back here to join, or creates an account through the link,
// which seats them and signs them in, in one step. A link works for ten
// minutes; the page counts down what is left, and says so when it is over.
// Core decides all of it.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError, joinCourse, joinPreview, newIdempotencyKey, type JoinPreview } from '@/api/http'
import { errorMessage } from '@/composables/useErrors'
import { useCountdown } from '@/composables/useCountdown'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import { LOCALES } from '@/i18n'
import AppWordmark from '@/components/AppWordmark.vue'
import { emailDomainAllowed, tokenFromRoute } from '@/utils/joinLink'
import JoinRegisterForm from './components/JoinRegisterForm.vue'
import { closedReason, joinRefusal, type ClosedReason } from './join'

const props = defineProps<{ token: string }>()
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const session = useSessionStore()
const ui = useUiStore()

const token = computed(() => tokenFromRoute(props.token))

// --- What the link is to ---------------------------------------------------------
const preview = shallowRef<JoinPreview | null>(null)
const loading = ref(true)
/** The link is unknown, or not a link at all: Core does not tell the two apart. */
const invalid = ref(false)
const loadError = shallowRef<unknown>(null)

async function load() {
  const tok = token.value
  preview.value = null
  invalid.value = false
  loadError.value = null
  if (!tok) {
    invalid.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    const p = await joinPreview(tok)
    if (tok === token.value) preview.value = p
  } catch (e) {
    if (tok !== token.value) return
    if (e instanceof ApiError && (e.isNotFound || e.status === 400)) invalid.value = true
    else loadError.value = e
  } finally {
    if (tok === token.value) loading.value = false
  }
}
watch(token, () => void load(), { immediate: true })

const courseLine = computed(() => {
  const c = preview.value?.course
  return c ? [c.code, c.section].filter(Boolean).join(' · ') : ''
})
const domains = computed(() => preview.value?.allowed_email_domains ?? [])
const domainList = computed(() => domains.value.map((d) => `@${d}`).join(', '))
// How long the link has left. Once its time is up it is said to have
// expired, as Core will say when asked again, which it is.
const { text: timeLeft, ended: timeUp } = useCountdown(() =>
  preview.value?.joinable ? preview.value.expires_at : null,
)
const countingDown = computed(() => !!preview.value?.joinable && !!preview.value.expires_at)
watch(
  () => countingDown.value && timeUp.value,
  (over) => {
    if (over) void refreshPreview()
  },
)
/** Why the link cannot be joined through now, or null when it can. */
const closed = computed<ClosedReason | null>(() => {
  if (!preview.value) return null
  if (countingDown.value && timeUp.value) return 'expired'
  return closedReason(preview.value)
})

// --- Who is here ------------------------------------------------------------------
const signedIn = computed(() => session.status === 'signedIn' && !!session.me)
const isAgent = computed(() => signedIn.value && session.me?.kind !== 'human')
const wrongDomain = computed(
  () => signedIn.value && !isAgent.value && !emailDomainAllowed(session.me?.email, domains.value),
)

// --- Joining, signed in -------------------------------------------------------------
const joining = ref(false)
const leaving = ref(false)
const failure = shallowRef<unknown>(null)
const failureText = computed(() => (failure.value ? (joinRefusal(failure.value) ?? errorMessage(failure.value)) : null))
/** One key for as long as the same join is tried again: Core does it once. */
let joinKey: string | null = null

async function join() {
  const tok = token.value
  if (!tok || joining.value) return
  joining.value = true
  failure.value = null
  joinKey ??= newIdempotencyKey()
  try {
    const out = await joinCourse(tok, joinKey)
    joinKey = null
    await session.loadMemberships().catch(() => undefined)
    // Someone in the course already is taken there: their seat, as it is.
    if (out.already_member) ElMessage({ type: 'info', message: t('join.page.member') })
    goToCourse(out.course_id)
  } catch (e) {
    if (!(e instanceof ApiError) || !(e.isNetwork || e.status >= 500)) joinKey = null
    failure.value = e
    // The link may have ended meanwhile: say so as the page does.
    if (e instanceof ApiError && !e.isNetwork) void refreshPreview()
  } finally {
    joining.value = false
  }
}

async function refreshPreview() {
  const tok = token.value
  if (!tok) return
  try {
    const p = await joinPreview(tok)
    if (tok === token.value) preview.value = p
  } catch {
    /* what is shown stands */
  }
}

// --- Signing in, or registering -----------------------------------------------------
// Signing in comes back here, to join at once: that is what it was for.
const here = computed(
  () => router.resolve({ name: 'join', params: { token: props.token }, query: { then: 'join' } }).fullPath,
)
const signInRoute = computed(() => ({ name: 'login', query: { next: here.value } }))
/**
 * Whether someone with no account may create one through this link. Core
 * can switch that off (a school whose people sign in with its own single
 * sign-on), and then the link is for signing in and joining alone.
 */
const mayRegister = computed(() => preview.value?.registration !== false)
const registering = ref(false)
const registerBusy = ref(false)
const registerFailure = shallowRef<unknown>(null)
const emailTaken = computed(
  () => registerFailure.value instanceof ApiError && registerFailure.value.details?.reason === 'email_taken',
)
const registerFailureText = computed(() => {
  const e = registerFailure.value
  if (!e) return null
  if (e instanceof ApiError && e.status === 429) {
    const n = Number(e.details?.retry_after_seconds)
    if (Number.isFinite(n) && n > 0) return t('join.page.wait', { n }, n)
  }
  return joinRefusal(e) ?? errorMessage(e)
})
const registerForm = ref<InstanceType<typeof JoinRegisterForm>>()
async function register(form: { display_name: string; email: string; password: string }) {
  const tok = token.value
  if (!tok || registerBusy.value) return
  registerBusy.value = true
  registerFailure.value = null
  try {
    const out = await session.registerThroughJoinLink(tok, form)
    registerForm.value?.clearPasswords()
    goToCourse(out.course_id)
  } catch (e) {
    registerFailure.value = e
    if (e instanceof ApiError && !e.isNetwork) void refreshPreview()
  } finally {
    registerBusy.value = false
  }
}

// Back from signing in to join: joined, once the link is known to take them.
// The request is taken out of the address first, so that coming back to the
// page later asks again.
const joinOnArrival = ref(route.query.then === 'join' && signedIn.value)
if (route.query.then !== undefined) {
  const { then: _then, ...rest } = route.query
  void router.replace({ query: rest })
}
watch(
  () => joinOnArrival.value && !!preview.value && signedIn.value,
  (ready) => {
    if (!ready) return
    joinOnArrival.value = false
    if (!closed.value && !isAgent.value && !wrongDomain.value) void join()
  },
  { immediate: true },
)

/** Signs out whoever is here, and offers signing in as someone else, back to this page. */
async function switchAccount() {
  leaving.value = true
  await session.signOut().catch(() => undefined)
  await router.push(signInRoute.value)
  leaving.value = false
}

/**
 * Into the course. If this page has held someone else before (they signed
 * out here to join as someone else), it is loaded afresh, as signing in
 * does: views cache names and look-ups that were theirs.
 */
function goToCourse(courseId: string) {
  leaving.value = true
  const to = { name: 'course-overview', params: { courseId } }
  if (session.startsAfresh()) window.location.assign(router.resolve(to).href)
  else void router.replace(to)
}
</script>

<template>
  <div class="join">
    <div class="join__lang">
      <el-select v-model="ui.locale" size="small" style="width: 120px" :aria-label="t('common.nav.language')">
        <el-option v-for="l in LOCALES" :key="l.value" :value="l.value" :label="l.label" />
      </el-select>
    </div>
    <main class="join__card" :aria-busy="loading || leaving">
      <AppWordmark class="join__wordmark" decorative />

      <div v-if="loading" v-loading="true" class="join__loading" />

      <el-result
        v-else-if="invalid"
        icon="warning"
        :title="t('join.page.invalidTitle')"
        :sub-title="t('join.page.invalid')"
        class="join__result"
      >
        <template #extra>
          <router-link :to="{ name: 'home' }">
            <el-button type="primary">{{ t('join.page.toHome') }}</el-button>
          </router-link>
        </template>
      </el-result>

      <el-result
        v-else-if="loadError || !preview"
        icon="error"
        :title="t('join.page.loadFailed')"
        :sub-title="loadError ? errorMessage(loadError) : ''"
        class="join__result"
      >
        <template #extra>
          <el-button type="primary" @click="load">{{ t('join.page.retry') }}</el-button>
        </template>
      </el-result>

      <template v-else>
        <p class="join__lead">{{ t('join.page.lead') }}</p>
        <section class="join__course" :aria-label="t('join.page.title')">
          <div class="join__code">{{ courseLine }}</div>
          <h1 class="join__title">{{ preview.course.title }}</h1>
        </section>

        <!-- Nobody can join through it now -->
        <el-result
          v-if="closed"
          icon="warning"
          :title="t('join.page.closedTitle')"
          :sub-title="t(`join.page.closed.${closed}`)"
          class="join__result join__result--closed"
        >
          <template #extra>
            <router-link :to="{ name: 'home' }">
              <el-button>{{ t('join.page.toHome') }}</el-button>
            </router-link>
          </template>
        </el-result>

        <template v-else>
          <p class="join__what">{{ t('join.page.asStudent') }}</p>
          <p v-if="countingDown" class="join__time" role="timer">
            <el-icon><Timer /></el-icon>
            <span>{{ t('join.page.timeLeft', { t: timeLeft }) }}</span>
          </p>
          <p v-if="domains.length" class="join__domains">
            <el-icon><Message /></el-icon>
            <span>{{ t('join.page.domains', { domains: domainList }) }}</span>
          </p>

          <!-- Signed in -->
          <template v-if="signedIn">
            <div class="join__who">
              <el-icon><User /></el-icon>
              <span>{{ t('join.page.signedInAs', { name: session.me?.display_name }) }}</span>
              <span v-if="session.me?.email" class="join__email">{{ session.me.email }}</span>
            </div>
            <el-alert v-if="isAgent" type="warning" :closable="false" show-icon :title="t('join.page.agent')" />
            <el-alert
              v-else-if="wrongDomain"
              type="warning"
              :closable="false"
              show-icon
              :title="t('join.page.wrongDomain', { email: session.me?.email, domains: domainList })"
            />
            <el-alert v-if="failureText" type="error" :closable="false" show-icon :title="failureText" class="join__alert" />
            <el-button
              v-if="!isAgent && !wrongDomain"
              type="primary"
              size="large"
              class="join__primary"
              :loading="joining || leaving"
              @click="join"
            >
              {{ t('join.page.join') }}
            </el-button>
            <p class="join__switch">
              {{ t('join.page.notYou') }}
              <el-button link type="primary" :disabled="leaving" @click="switchAccount">
                {{ t('join.page.switchAccount') }}
              </el-button>
            </p>
          </template>

          <!-- Signed out: sign in and come back, or register here -->
          <template v-else>
            <template v-if="!registering || !mayRegister">
              <el-alert
                v-if="registering && registerFailureText"
                type="warning"
                :closable="false"
                show-icon
                :title="registerFailureText"
                class="join__alert"
              />
              <p class="join__what">
                {{ mayRegister ? t('join.page.signedOutLead') : t('join.page.signedOutLeadSignInOnly') }}
              </p>
              <div class="join__paths">
                <router-link :to="signInRoute" class="join__path">
                  <el-button type="primary" size="large" class="join__primary">{{ t('join.page.signIn') }}</el-button>
                </router-link>
                <el-button v-if="mayRegister" size="large" class="join__primary" @click="registering = true">
                  {{ t('join.page.register') }}
                </el-button>
              </div>
            </template>
            <template v-else>
              <h2 class="join__subtitle">{{ t('join.page.registerTitle') }}</h2>
              <el-alert
                v-if="registerFailureText"
                :type="emailTaken ? 'warning' : 'error'"
                :closable="false"
                show-icon
                :title="registerFailureText"
                class="join__alert"
              >
                <router-link v-if="emailTaken" :to="signInRoute">
                  <el-button type="primary" size="small" class="join__instead">{{ t('join.page.signInInstead') }}</el-button>
                </router-link>
              </el-alert>
              <JoinRegisterForm ref="registerForm" :domains="domains" :busy="registerBusy || leaving" @submit="register" />
              <p class="join__switch">
                {{ t('join.page.haveAccount') }}
                <router-link :to="signInRoute">{{ t('join.page.signIn') }}</router-link>
              </p>
            </template>
          </template>
        </template>
      </template>
    </main>
  </div>
</template>

<style scoped>
.join {
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
.join__lang {
  position: absolute;
  top: 16px;
  right: 16px;
}
.join__card {
  width: 100%;
  max-width: 460px;
  background: var(--app-card);
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-card);
  padding: 32px 28px 24px;
  box-shadow: var(--app-shadow-raised);
}
.join__wordmark {
  height: 30px;
  margin-bottom: 20px;
}
.join__loading {
  min-height: 160px;
}
.join__lead {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.join__course {
  margin: 4px 0 16px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--app-indigo-tint);
}
.join__code {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--el-color-primary);
  word-break: break-word;
}
.join__title {
  margin: 4px 0 0;
  font-size: 22px;
  line-height: 1.3;
  word-break: break-word;
}
.join__what {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.join__time {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: -4px 0 12px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
}
.join__domains {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.join__domains .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
}
.join__who {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 0 0 12px;
  font-size: 14px;
}
.join__email {
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.join__alert {
  margin-bottom: 12px;
}
.join__who + .el-alert {
  margin-bottom: 12px;
}
.join__primary {
  width: 100%;
  margin: 0;
}
.join__paths {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.join__path {
  display: block;
}
.join__subtitle {
  margin: 8px 0 12px;
  font-size: 17px;
}
.join__switch {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
.join__instead {
  margin-top: 6px;
}
.join__result {
  padding: 8px 0 0;
}
.join__result--closed {
  padding-top: 0;
}
@media (max-width: 480px) {
  .join__card {
    padding: 24px 18px 20px;
  }
  .join__title {
    font-size: 20px;
  }
}
</style>
