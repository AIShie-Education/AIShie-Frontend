<script setup lang="ts">
// Adding an identity provider of the site's (sso.create), or changing one
// (sso.update). The redirect URI to register at the provider comes first,
// with a copy button and short help for the providers schools use most, since
// it is needed before the provider gives a client id or a secret. Then its id
// (never changed after), the name on its sign-in button, with the button as
// the sign-in page will show it, its issuer (which can be tested here before
// anything is saved: sso.test, which sends no secret), its client id and
// secret; what it asks for and which claims it reads, under Advanced; and
// whether it links someone to their account by the email it vouches for,
// which is off unless turned on, with the rules that holds to.
//
// The client secret is write-only. It is in its password field and nowhere
// else: never in a log, an error or anything kept, and cleared once saved and
// whenever the dialog closes (destroy-on-close then takes its field away).
// Editing, the secret kept shows as its hint and is sent only when replaced.
// Its idempotency key is kept only to send the same thing again after no
// answer, and dropped as soon as anything is changed (writeKey), so nothing
// holds what was sent to compare with.
//
// A change sends only what changed from the provider as read, over its
// version. When it changed meanwhile (version_mismatch), it is read again,
// what the administrator changed is kept over it, and they are told so.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/api/http'
import { scopedReasonMessage } from '@/composables/useErrors'
import IdpHelp from './IdpHelp.vue'
import RedirectUri from './RedirectUri.vue'
import SsoTestReport from './SsoTestReport.vue'
import {
  DEFAULT_EMAIL_CLAIM,
  DEFAULT_SCOPES,
  DEFAULT_SUBJECT_CLAIM,
  DISPLAY_NAME_MAX,
  POSITION_MAX,
  REFUSALS,
  createArgs,
  createProvider,
  emptyForm,
  fieldOf,
  fieldRefusalText,
  formFrom,
  formProblems,
  getProvider,
  isGone,
  isVersionMismatch,
  issuerProblem,
  normalizeDomain,
  reasonOf,
  ssoErrorText,
  testArgs,
  testProvider,
  updateArgs,
  updateProvider,
  writeKey,
  type FormField,
  type ProviderForm,
  type SsoProvider,
  type SsoReport,
} from './ssoAdmin'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  /** The site's provider to change, or null to add one. */
  provider: SsoProvider | null
  /** What to register at the provider as its redirect URI (sso.list's). */
  redirectUri: string
  /** The ids taken already, the operator's and the site's. */
  takenIds: readonly string[]
  /** Whether the server can seal a secret (sso.list's can_add): without SECRETS_KEY none can be given. */
  canSeal: boolean
}>()
const emit = defineEmits<{
  saved: [provider: SsoProvider]
  /** The list should be read again: the provider changed or went meanwhile. */
  changed: []
}>()
const { t } = useI18n()

const creating = computed(() => !props.provider)
/** The provider as last read: what a change is made to, and over which version. */
const base = shallowRef<SsoProvider | null>(null)
const form = reactive<ProviderForm>(emptyForm())
/** The form as the provider was read, to send only what changed from it. */
let initial: ProviderForm = emptyForm()
/** The client secret typed: in its field alone. */
const secret = ref('')
const secretMode = ref<'keep' | 'new'>('new')
const advanced = ref<string[]>([])
const key = writeKey()

const saving = ref(false)
const error = shallowRef<unknown>(null)
const notice = ref('')
const fieldErrors = reactive<Partial<Record<FormField, string>>>({})

const testing = ref(false)
const report = shallowRef<SsoReport | null>(null)
const testError = shallowRef<unknown>(null)
let testGeneration = 0

const sendingSecret = computed(() => creating.value || secretMode.value === 'new')
const secretUnavailable = computed(() => base.value?.status === 'secret_unavailable')
const linked = computed(() => base.value?.linked_accounts ?? 0)
const issuerChanged = computed(() => !creating.value && form.issuer.trim() !== initial.issuer.trim())

const ADVANCED_FIELDS: readonly FormField[] = ['scopes', 'subjectClaim', 'emailClaim', 'position']

function clearMessages() {
  error.value = null
  notice.value = ''
  for (const k of Object.keys(fieldErrors) as FormField[]) delete fieldErrors[k]
}

function clearTest() {
  testGeneration++
  testing.value = false
  report.value = null
  testError.value = null
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Whether Advanced holds anything but the defaults, and so opens by itself. */
function advancedInUse(f: ProviderForm): boolean {
  return (
    !sameValue(f.scopes, DEFAULT_SCOPES) ||
    f.subjectClaim !== DEFAULT_SUBJECT_CLAIM ||
    (!!f.emailClaim && !(f.linkByEmail && f.emailClaim === DEFAULT_EMAIL_CLAIM))
  )
}

/** The dialog as it opens: the provider to change, or an empty form. */
function start() {
  clearMessages()
  clearTest()
  secret.value = ''
  key.forget()
  const p = props.provider
  base.value = p
  Object.assign(form, p ? formFrom(p) : emptyForm())
  initial = p ? formFrom(p) : emptyForm()
  // A secret the server's keys no longer open is asked for again.
  secretMode.value = p && p.status !== 'secret_unavailable' ? 'keep' : 'new'
  advanced.value = advancedInUse(form) ? ['advanced'] : []
}

/** Everything of the secret goes: its field, and the key it was sent under. */
function forgetSecret() {
  secret.value = ''
  key.forget()
}

watch(
  open,
  (v) => {
    if (v) start()
    else {
      forgetSecret()
      clearTest()
    }
  },
  { immediate: true },
)

// Keeping the secret as it is: nothing typed for a new one is kept.
watch(secretMode, (m) => {
  if (m === 'keep') secret.value = ''
  delete fieldErrors.clientSecret
})
// Anything changed is a new intended write, under a new key.
watch([form, secret, secretMode], () => key.forget(), { deep: true })
watch(secret, () => delete fieldErrors.clientSecret)
for (const f of Object.keys(form) as (keyof ProviderForm)[]) {
  watch(
    () => form[f],
    () => delete fieldErrors[f],
    { deep: true },
  )
}
// A test is of the issuer, scopes and claims it was made with: changing them makes it old.
watch(
  () => [form.issuer, form.scopes, form.subjectClaim, form.emailClaim, form.linkByEmail],
  () => {
    if (report.value || testError.value) clearTest()
  },
  { deep: true },
)

/** Linking by email reads the email claim: named email unless another is. */
watch(
  () => form.linkByEmail,
  (on) => {
    if (on && !form.emailClaim.trim()) form.emailClaim = DEFAULT_EMAIL_CLAIM
  },
)

function onScopes(v: string[]) {
  const seen = new Set<string>()
  form.scopes = v.map((s) => s.trim()).filter((s) => s && !seen.has(s) && seen.add(s))
}
function onDomains(v: string[]) {
  const seen = new Set<string>()
  form.allowedEmailDomains = v.map(normalizeDomain).filter((d) => d && !seen.has(d) && seen.add(d))
}

const previewName = computed(() => form.displayName.trim())

// --- Testing the issuer ---------------------------------------------------------------------

async function test() {
  const problem = issuerProblem(form.issuer)
  if (problem) {
    fieldErrors.issuer = t(`ssoAdmin.form.invalid.${problem === 'required' ? 'required' : `issuer_${problem}`}`)
    return
  }
  const mine = ++testGeneration
  testing.value = true
  report.value = null
  testError.value = null
  try {
    const r = await testProvider(testArgs(form))
    if (mine === testGeneration) report.value = r
  } catch (e) {
    if (mine === testGeneration) testError.value = e
  } finally {
    if (mine === testGeneration) testing.value = false
  }
}

// --- Saving ----------------------------------------------------------------------------------

/** Shows a refusal where it belongs: on its field, or above the buttons. */
function showError(e: unknown) {
  const reason = reasonOf(e)
  if (reason === 'id_taken' && creating.value) {
    fieldErrors.id = ssoErrorText(e)
    return
  }
  if (e instanceof ApiError && e.code === 'invalid_argument') {
    const f = fieldOf(e.details?.field)
    if (f && (f !== 'id' || creating.value) && (f !== 'clientSecret' || sendingSecret.value)) {
      if (ADVANCED_FIELDS.includes(f)) advanced.value = ['advanced']
      // This page's words for its reason where it has them (an issuer at an
      // address the server does not reach for a provider of the site's,
      // issuer_address_not_allowed), and otherwise Core's, which name the rule.
      fieldErrors[f] =
        scopedReasonMessage(e, { reasons: REFUSALS }) ?? t('ssoAdmin.form.refusedField', { message: fieldRefusalText(e) })
      return
    }
  }
  error.value = e
}

/** Reads the provider again after a version_mismatch, and keeps what was changed here over it. */
async function rebase() {
  const b = base.value
  if (!b) return
  const fresh = await getProvider(b.id)
  const freshForm = formFrom(fresh)
  for (const k of Object.keys(form) as (keyof ProviderForm)[]) {
    if (sameValue(form[k], initial[k])) (form as Record<string, unknown>)[k] = structuredClone(freshForm[k])
  }
  base.value = fresh
  initial = freshForm
  if (fresh.status === 'secret_unavailable') secretMode.value = 'new'
}

/** The provider is no longer one to change here: gone, or the operator's id now. */
function leave(words: string, type: 'info' | 'warning') {
  ElMessage({ type, message: words, duration: 6000, showClose: true })
  open.value = false
  emit('changed')
}

async function save() {
  if (saving.value) return
  clearMessages()
  const problems = formProblems(form, {
    creating: creating.value,
    sendingSecret: sendingSecret.value,
    secret: secret.value,
    takenIds: props.takenIds,
  })
  for (const [f, k] of Object.entries(problems)) fieldErrors[f as FormField] = t(k as string)
  if (ADVANCED_FIELDS.some((f) => problems[f])) advanced.value = ['advanced']
  if (Object.keys(problems).length) return

  saving.value = true
  try {
    if (creating.value) {
      const p = await createProvider(createArgs(form, secret.value), key.get())
      key.settled()
      done(p, 'ssoAdmin.form.created')
    } else {
      const args = updateArgs(base.value!, initial, form, sendingSecret.value ? secret.value : null)
      if (!args) {
        open.value = false
        return
      }
      const p = await updateProvider(args, key.get())
      key.settled()
      done(p, 'ssoAdmin.form.saved')
    }
  } catch (e) {
    key.settled(e)
    if (!creating.value && isVersionMismatch(e)) {
      try {
        await rebase()
        notice.value = t('ssoAdmin.form.changedMeanwhile')
        emit('changed')
      } catch (again) {
        if (isGone(again)) leave(t('ssoAdmin.refusal.sso_provider_not_found'), 'info')
        else error.value = again
      }
      return
    }
    if (!creating.value && isGone(e)) return leave(t('ssoAdmin.refusal.sso_provider_not_found'), 'info')
    if (!creating.value && reasonOf(e) === 'set_by_operator') return leave(ssoErrorText(e), 'warning')
    showError(e)
  } finally {
    saving.value = false
  }
}

function done(p: SsoProvider, words: string) {
  forgetSecret()
  ElMessage({ type: 'success', message: t(words, { name: p.display_name || p.id }), duration: 6000 })
  open.value = false
  emit('saved', p)
}

const title = computed(() =>
  props.provider
    ? t('ssoAdmin.form.editTitle', { name: props.provider.display_name || props.provider.id })
    : t('ssoAdmin.form.createTitle'),
)
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="640px"
    destroy-on-close
    :close-on-click-modal="!saving"
    class="sso-dialog"
  >
    <el-alert
      v-if="notice"
      type="warning"
      :closable="false"
      show-icon
      :title="notice"
      class="sso-dialog__alert sso-dialog__notice"
    />

    <section class="sso-dialog__setup">
      <RedirectUri :uri="redirectUri" />
      <IdpHelp class="sso-dialog__help" />
    </section>

    <el-form label-position="top" class="sso-form" @submit.prevent>
      <el-form-item v-if="creating" :label="t('ssoAdmin.form.id')" :error="fieldErrors.id">
        <el-input
          v-model="form.id"
          maxlength="64"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="t('ssoAdmin.form.idPlaceholder')"
          class="sso-form__id"
        />
        <div class="app-form-hint">{{ t('ssoAdmin.form.idHint') }}</div>
      </el-form-item>
      <el-form-item v-else :label="t('ssoAdmin.form.id')">
        <code class="sso-form__id-fixed">{{ provider?.id }}</code>
        <div class="app-form-hint">{{ t('ssoAdmin.form.idFixed') }}</div>
      </el-form-item>

      <el-form-item :label="t('ssoAdmin.form.displayName')" :error="fieldErrors.displayName">
        <el-input
          v-model="form.displayName"
          :maxlength="DISPLAY_NAME_MAX"
          show-word-limit
          :placeholder="t('ssoAdmin.form.displayNamePlaceholder')"
          class="sso-form__name"
        />
        <div class="app-form-hint">{{ t('ssoAdmin.form.displayNameHint') }}</div>
        <div class="sso-preview" :aria-label="t('ssoAdmin.form.preview')" role="group">
          <span class="sso-preview__caption">{{ t('ssoAdmin.form.preview') }}</span>
          <div v-if="previewName" class="el-button el-button--large sso-preview__button">
            <span>{{ t('auth.sso', { provider: previewName }) }}</span>
          </div>
          <span v-else class="app-muted sso-preview__empty">{{ t('ssoAdmin.form.previewEmpty') }}</span>
        </div>
      </el-form-item>

      <el-form-item :label="t('ssoAdmin.form.issuer')" :error="fieldErrors.issuer">
        <div class="sso-form__issuer-row">
          <el-input
            v-model="form.issuer"
            type="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="t('ssoAdmin.form.issuerPlaceholder')"
            class="sso-form__issuer"
          />
          <el-button :loading="testing" class="sso-form__test" @click="test">
            <el-icon aria-hidden="true"><Connection /></el-icon>
            <span>{{ t('ssoAdmin.form.test') }}</span>
          </el-button>
        </div>
        <div class="app-form-hint">{{ t('ssoAdmin.form.issuerHint') }}</div>
      </el-form-item>
      <el-alert
        v-if="issuerChanged && linked > 0"
        type="warning"
        :closable="false"
        show-icon
        :title="t('ssoAdmin.form.issuerLinked', { n: linked }, linked)"
        class="sso-dialog__alert sso-form__issuer-linked"
      />
      <div v-if="report || testError" class="sso-form__report">
        <el-alert
          v-if="testError"
          type="error"
          :closable="false"
          show-icon
          :title="ssoErrorText(testError)"
          class="sso-form__test-error"
        />
        <SsoTestReport v-else-if="report" :report="report" />
      </div>

      <el-form-item :label="t('ssoAdmin.form.clientId')" :error="fieldErrors.clientId">
        <el-input
          v-model="form.clientId"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="sso-form__client-id"
        />
      </el-form-item>

      <el-form-item :label="t('ssoAdmin.form.clientSecret')" :error="fieldErrors.clientSecret">
        <el-alert
          v-if="secretUnavailable"
          type="error"
          :closable="false"
          show-icon
          :title="t('ssoAdmin.statusWhy.secret_unavailable')"
          class="sso-dialog__alert sso-form__secret-unavailable"
        />
        <el-radio-group v-else-if="!creating" v-model="secretMode" class="sso-form__secret-mode">
          <el-radio value="keep" class="sso-form__secret-keep">
            {{ t('ssoAdmin.form.secretKeep', { hint: base?.client_secret_hint ?? '…' }) }}
          </el-radio>
          <el-radio value="new" class="sso-form__secret-new">{{ t('ssoAdmin.form.secretNew') }}</el-radio>
        </el-radio-group>
        <template v-if="sendingSecret">
          <el-input
            v-model="secret"
            type="password"
            autocomplete="off"
            name="aishie-sso-client-secret"
            :placeholder="t('ssoAdmin.form.secretPlaceholder')"
            :disabled="!canSeal"
            class="sso-form__secret"
          />
          <div class="app-form-hint">
            {{ canSeal ? t('ssoAdmin.form.secretHint') : t('ssoAdmin.refusal.secrets_key_missing') }}
          </div>
        </template>
      </el-form-item>

      <el-collapse v-model="advanced" class="sso-form__advanced">
        <el-collapse-item name="advanced" :title="t('ssoAdmin.form.advanced')">
          <el-form-item :label="t('ssoAdmin.form.scopes')" :error="fieldErrors.scopes">
            <el-select
              :model-value="form.scopes"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              class="sso-form__scopes"
              @update:model-value="onScopes"
            >
              <el-option v-for="s in DEFAULT_SCOPES" :key="s" :value="s" :label="s" />
            </el-select>
            <div class="app-form-hint">{{ t('ssoAdmin.form.scopesHint') }}</div>
          </el-form-item>
          <el-form-item :label="t('ssoAdmin.form.subjectClaim')" :error="fieldErrors.subjectClaim">
            <el-input
              v-model="form.subjectClaim"
              autocomplete="off"
              spellcheck="false"
              :placeholder="DEFAULT_SUBJECT_CLAIM"
              class="sso-form__subject"
            />
            <div class="app-form-hint">{{ t('ssoAdmin.form.subjectClaimHint') }}</div>
          </el-form-item>
          <el-form-item :label="t('ssoAdmin.form.emailClaim')" :error="fieldErrors.emailClaim">
            <el-input
              v-model="form.emailClaim"
              autocomplete="off"
              spellcheck="false"
              :placeholder="form.linkByEmail ? DEFAULT_EMAIL_CLAIM : t('ssoAdmin.form.emailClaimNone')"
              class="sso-form__email-claim"
            />
            <div class="app-form-hint">{{ t('ssoAdmin.form.emailClaimHint') }}</div>
          </el-form-item>
          <el-form-item :label="t('ssoAdmin.form.position')" :error="fieldErrors.position">
            <el-input-number
              v-model="form.position"
              :min="0"
              :max="POSITION_MAX"
              :precision="0"
              :value-on-clear="null"
              controls-position="right"
              :placeholder="t('ssoAdmin.form.positionLast')"
              class="sso-form__position"
            />
            <div class="app-form-hint">{{ t('ssoAdmin.form.positionHint') }}</div>
          </el-form-item>
        </el-collapse-item>
      </el-collapse>

      <div class="sso-form__by-email">
        <div class="sso-form__switch">
          <el-switch v-model="form.linkByEmail" id="sso-link-by-email" class="sso-form__link-by-email" />
          <label for="sso-link-by-email" class="sso-form__switch-label">{{ t('ssoAdmin.form.linkByEmail') }}</label>
        </div>
        <div class="sso-form__by-email-rules">
          <p>{{ t('ssoAdmin.form.byEmail.intro') }}</p>
          <ul>
            <li>{{ t('ssoAdmin.form.byEmail.verified') }}</li>
            <li>{{ t('ssoAdmin.form.byEmail.domain') }}</li>
            <li>{{ t('ssoAdmin.form.byEmail.account') }}</li>
            <li>{{ t('ssoAdmin.form.byEmail.noRole') }}</li>
            <li>{{ t('ssoAdmin.form.byEmail.notLinked') }}</li>
          </ul>
          <p>{{ t('ssoAdmin.form.byEmail.otherwise') }}</p>
          <p>{{ t('ssoAdmin.form.byEmail.noVerified') }}</p>
        </div>
        <el-form-item
          v-if="form.linkByEmail"
          :label="t('ssoAdmin.form.domains')"
          :error="fieldErrors.allowedEmailDomains"
        >
          <el-select
            :model-value="form.allowedEmailDomains"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            :placeholder="t('ssoAdmin.form.domainsPlaceholder')"
            class="sso-form__domains"
            @update:model-value="onDomains"
          >
            <el-option v-for="d in form.allowedEmailDomains" :key="d" :value="d" :label="d" />
          </el-select>
          <div class="app-form-hint">{{ t('ssoAdmin.form.domainsHint') }}</div>
        </el-form-item>
      </div>
    </el-form>

    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      show-icon
      :title="ssoErrorText(error)"
      class="sso-dialog__alert sso-dialog__error"
    />

    <template #footer>
      <el-button :disabled="saving" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" class="sso-dialog__save" :loading="saving" @click="save">
        {{ creating ? t('ssoAdmin.form.add') : t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.sso-dialog__alert {
  margin-bottom: 12px;
}
.sso-dialog__setup {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.sso-form :deep(.el-select),
.sso-form__position {
  width: 100%;
}
.sso-form__position {
  max-width: 220px;
}
.sso-form__id-fixed {
  font-size: var(--app-text-sm);
}
.sso-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  width: 100%;
  margin-top: 8px;
}
.sso-preview__caption {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
/* The sign-in page's button, as it will show there: not one to press here. */
.sso-preview__button {
  flex: 1 1 220px;
  min-width: 0;
  max-width: 364px;
  pointer-events: none;
  cursor: default;
}
.sso-preview__button span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.sso-preview__empty {
  font-size: var(--app-text-xs);
}
.sso-form__issuer-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.sso-form__issuer {
  flex: 1;
  min-width: 0;
}
.sso-form__test {
  flex-shrink: 0;
}
.sso-form__report {
  margin: -4px 0 18px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-control);
}
.sso-form__secret-mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 8px;
}
.sso-form__advanced {
  margin-bottom: 18px;
}
.sso-form__by-email {
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.sso-form__switch {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.sso-form__switch-label {
  font-weight: var(--app-weight-strong);
  font-size: var(--app-text-md);
}
.sso-form__by-email-rules {
  margin-bottom: 12px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-secondary);
}
.sso-form__by-email-rules p {
  margin: 0 0 4px;
}
.sso-form__by-email-rules ul {
  margin: 0 0 4px;
  padding-left: 18px;
}
@media (max-width: 480px) {
  .sso-form__issuer-row {
    flex-direction: column;
  }
  .sso-form__test {
    align-self: flex-start;
  }
}
</style>
