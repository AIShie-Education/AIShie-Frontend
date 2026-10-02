<script setup lang="ts">
// Documents' text versions (文字版), as the site sets the runtime's
// transcriber (GET and PATCH admin/settings' transcription): on or off,
// which model of the school's plan transcribes (on the school's key), how
// many pages a document may have, how many a day, and how many documents
// at once. The operator's environment is the ceiling: where the transcriber
// cannot run (TRANSCRIBE=off, or a Core without its queue) the card says
// why, and it can only be turned off. It says what the transcriber is doing
// now (off, running, standing by for another worker, blocked and why), and
// today's numbers.
//
// The credential it calls Core with is issued here and handed straight to
// the runtime by one button (transcription.ts: issue in Core, give to the
// runtime, revoke the others; revoke the new one if the runtime refuses
// it), and withdrawn by another (the runtime forgets it, Core revokes it).
// No token is ever shown. The switch saves at once; the form when saved.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { RuntimeSettingsPatch, TranscriptionSettings } from '@/api/runtime-types'
import { useAsync } from '@/composables/useAsync'
import DailyReset from '@/components/DailyReset.vue'
import TimeText from '@/components/TimeText.vue'
import OperatorDetail from '../components/OperatorDetail.vue'
import ActorLink from './ActorLink.vue'
import ChangedBy from './ChangedBy.vue'
import RuntimeAsync from './RuntimeAsync.vue'
import TranscriptionJobs from './TranscriptionJobs.vue'
import { adminErrorText, usdShown } from './runtimeAdmin'
import {
  CONCURRENCY_LIMIT,
  CREDENTIAL_TAG,
  MAX_PAGES_LIMIT,
  OFFER_STATUS_TAG,
  PER_DAY_PAGES_LIMIT,
  STATE_TAG,
  blockedReason,
  credentialErrorText,
  formFieldOf,
  formOf,
  formProblems,
  handOverServiceCredential,
  patchFrom,
  withdrawServiceCredential,
  type TranscriptionForm,
} from './transcription'

const { t, n } = useI18n()

const settings = useAsync(() => runtimeAdmin.settings().then((r) => r.data), { keepData: true })
const tr = computed<TranscriptionSettings | null>(() => settings.data.value?.transcription ?? null)
/** A runtime from before the transcriber answers the settings without it. */
const notOffered = computed(() => !!settings.data.value && !settings.data.value.transcription)
const plan = useAsync(() => runtimeAdmin.plan().then((r) => r.data), { keepData: true })

function apply(next: TranscriptionSettings) {
  if (settings.data.value) settings.data.value = { ...settings.data.value, transcription: next }
}

const stateText = computed(() => {
  const s = tr.value
  if (!s) return ''
  const why = blockedReason(s)
  if (why) return t('runtimeAdmin.transcription.state.blocked', { why: t(`runtimeAdmin.transcription.blocked.${why}`) })
  return t(`runtimeAdmin.transcription.state.${s.state}`)
})

// --- The switch ------------------------------------------------------------------------
const saving = ref<'enabled' | 'form' | null>(null)
const error = shallowRef<unknown>(null)

async function patch(what: 'enabled' | 'form', body: RuntimeSettingsPatch, done: string): Promise<boolean> {
  if (saving.value) return false
  saving.value = what
  error.value = null
  try {
    const r = await runtimeAdmin.updateSettings(body)
    settings.data.value = r.data
    ElMessage({ type: 'success', message: done })
    return true
  } catch (e) {
    const field = isRuntimeError(e) ? formFieldOf(e.details?.field) : null
    if (field && isRuntimeError(e) && (e.reason === 'invalid_field' || e.reason === 'offer_no_file_input'))
      fieldErrors[field] = adminErrorText(e, t)
    else error.value = e
    // The operator's environment, or the plan, may have changed since it was read: read it again.
    if (isRuntimeError(e) && e.reason === 'transcription_unavailable') void settings.reload()
    return false
  } finally {
    saving.value = null
  }
}

function setEnabled(on: string | number | boolean) {
  const enabled = on === true
  void patch(
    'enabled',
    { transcription: { enabled } },
    t(enabled ? 'runtimeAdmin.transcription.turnedOn' : 'runtimeAdmin.transcription.turnedOff'),
  )
}

// --- The form ---------------------------------------------------------------------------
const form = ref<TranscriptionForm>({ offer: null, maxPages: 300, perDayPages: null, concurrency: 2 })
const fieldErrors = reactive<Partial<Record<keyof TranscriptionForm, string>>>({})
// Taken afresh when what is in force changes, and not when only the switch or the credential did.
watch(
  () => (tr.value ? JSON.stringify(formOf(tr.value)) : ''),
  () => {
    if (tr.value) form.value = formOf(tr.value)
  },
  { immediate: true },
)
const changed = computed(() => !!tr.value && Object.keys(patchFrom(tr.value, form.value)).length > 0)
const problems = computed(() => formProblems(form.value))
const problemOf = (k: keyof TranscriptionForm) => fieldErrors[k] ?? (problems.value[k] ? t(problems.value[k]!) : '')

async function save() {
  if (!tr.value || Object.keys(problems.value).length) return
  for (const k of Object.keys(fieldErrors) as (keyof TranscriptionForm)[]) delete fieldErrors[k]
  await patch('form', { transcription: patchFrom(tr.value, form.value) }, t('runtimeAdmin.transcription.saved'))
}
function undo() {
  if (tr.value) form.value = formOf(tr.value)
  for (const k of Object.keys(fieldErrors) as (keyof TranscriptionForm)[]) delete fieldErrors[k]
}

/** The plan's offers the transcriber may be given: those offered now, and the one it has, whatever it is. */
const offerOptions = computed(() => {
  const offers = plan.data.value?.offers ?? []
  const out = offers
    .filter((o) => o.enabled && o.status === 'offered')
    .map((o) => ({ value: o.id, label: o.label, model: o.model, gone: false }))
  const current = tr.value?.offer
  if (current && !out.some((o) => o.value === current)) {
    const o = offers.find((x) => x.id === current)
    out.push({ value: current, label: o?.label ?? current, model: o?.model ?? '', gone: true })
  }
  return out
})

// --- The credential ------------------------------------------------------------------------
const credentialBusy = ref<'issue' | 'withdraw' | null>(null)
const credentialError = shallowRef<unknown>(null)
/** After a hand-over: the service's other credentials Core could not revoke; or after a withdrawal, Core could not revoke it. */
const credentialWarning = ref('')

async function issue() {
  if (credentialBusy.value) return
  credentialBusy.value = 'issue'
  credentialError.value = null
  credentialWarning.value = ''
  try {
    const out = await handOverServiceCredential({
      confirmReplaceAll: (live) =>
        ElMessageBox.confirm(
          t('runtimeAdmin.transcription.credential.replaceAllBody', { n: live }),
          t('runtimeAdmin.transcription.credential.replaceAllTitle'),
          {
            type: 'warning',
            confirmButtonText: t('runtimeAdmin.transcription.credential.replaceAll'),
            cancelButtonText: t('common.actions.cancel'),
          },
        ).then(
          () => true,
          () => false,
        ),
    })
    if (!out) return
    apply(out.settings)
    ElMessage({ type: 'success', message: t('runtimeAdmin.transcription.credential.handedOver') })
    if (out.unrevoked)
      credentialWarning.value = t(
        'runtimeAdmin.transcription.credential.unrevoked',
        { n: out.unrevoked },
        out.unrevoked,
      )
  } catch (e) {
    credentialError.value = e
  } finally {
    credentialBusy.value = null
  }
}

async function withdraw() {
  const s = tr.value
  if (!s || credentialBusy.value) return
  const ok = await ElMessageBox.confirm(
    t('runtimeAdmin.transcription.credential.withdrawBody'),
    t('runtimeAdmin.transcription.credential.withdrawTitle'),
    {
      type: 'warning',
      confirmButtonText: t('runtimeAdmin.transcription.credential.withdraw'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).then(
    () => true,
    () => false,
  )
  if (!ok) return
  credentialBusy.value = 'withdraw'
  credentialError.value = null
  credentialWarning.value = ''
  try {
    const out = await withdrawServiceCredential(s.credential)
    apply(out.settings)
    ElMessage({ type: 'success', message: t('runtimeAdmin.transcription.credential.withdrawn') })
    if (out.coreRevoked === false) credentialWarning.value = t('runtimeAdmin.transcription.credential.notRevoked')
  } catch (e) {
    credentialError.value = e
  } finally {
    credentialBusy.value = null
  }
}
</script>

<template>
  <section class="app-card transcription-card">
    <h2 class="app-card__title transcription-card__title">
      <span>{{ t('runtimeAdmin.transcription.title') }}</span>
      <el-tag v-if="tr" :type="STATE_TAG[tr.state] ?? 'info'" disable-transitions class="transcription-card__state">
        {{ stateText }}
      </el-tag>
    </h2>
    <p class="transcription-card__intro">{{ t('runtimeAdmin.transcription.intro') }}</p>

    <RuntimeAsync
      :loading="settings.loading.value && !settings.data.value"
      :error="settings.data.value ? null : settings.error.value"
      @retry="settings.reload"
    >
      <p v-if="notOffered" class="transcription-card__not-offered" role="status">
        <el-icon aria-hidden="true"><InfoFilled /></el-icon>
        <span>{{ t('runtimeAdmin.state.notOffered') }}</span>
      </p>
      <template v-else-if="tr">
        <el-alert
          v-if="!tr.available"
          type="warning"
          :closable="false"
          show-icon
          :title="t(`runtimeAdmin.transcription.unavailable.${tr.unavailable_reason ?? 'operator_off'}`)"
          class="transcription-card__alert transcription-card__unavailable"
        >
          <OperatorDetail
            v-if="(tr.unavailable_reason ?? 'operator_off') === 'operator_off'"
            :text="t('runtimeAdmin.flags.transcribeOff')"
          />
          <details v-if="tr.unavailable_detail" class="transcription-card__details">
            <summary>{{ t('runtimeAdmin.ocr.details') }}</summary>
            <code>{{ tr.unavailable_detail }}</code>
          </details>
        </el-alert>

        <div class="transcription-card__switch">
          <el-switch
            id="transcription-enabled"
            :model-value="tr.enabled"
            :loading="saving === 'enabled'"
            :disabled="(!tr.available && !tr.enabled) || (!!saving && saving !== 'enabled')"
            class="transcription-card__enabled"
            @change="setEnabled"
          />
          <div>
            <label for="transcription-enabled" class="transcription-card__switch-label">
              {{ t('runtimeAdmin.transcription.enabled') }}
            </label>
            <p class="app-form-hint">{{ t('runtimeAdmin.transcription.enabledHint') }}</p>
          </div>
        </div>

        <el-form label-position="top" class="transcription-card__form" @submit.prevent>
          <el-form-item :label="t('runtimeAdmin.transcription.offer')" :error="problemOf('offer')">
            <div class="transcription-card__offer">
              <el-select
                v-model="form.offer"
                clearable
                :placeholder="t('runtimeAdmin.transcription.noOffer')"
                :loading="plan.loading.value"
                :disabled="!!saving"
                class="transcription-card__offer-select"
                @clear="form.offer = null"
              >
                <el-option v-for="o in offerOptions" :key="o.value" :value="o.value" :label="o.label">
                  <span>{{ o.label }}</span>
                  <span class="transcription-card__option-model">{{ o.model }}</span>
                </el-option>
              </el-select>
              <el-tag
                v-if="tr.offer_status && tr.offer_status !== 'ok' && form.offer === tr.offer"
                :type="OFFER_STATUS_TAG[tr.offer_status] ?? 'warning'"
                size="small"
                disable-transitions
                class="transcription-card__offer-status"
              >
                {{ t(`runtimeAdmin.transcription.offerStatus.${tr.offer_status}`) }}
              </el-tag>
            </div>
            <p class="app-form-hint">{{ t('runtimeAdmin.transcription.offerHint') }}</p>
          </el-form-item>
          <div class="transcription-card__numbers">
            <el-form-item :label="t('runtimeAdmin.transcription.maxPages')" :error="problemOf('maxPages')">
              <el-input-number
                v-model="form.maxPages"
                :min="1"
                :max="MAX_PAGES_LIMIT"
                :step="10"
                step-strictly
                :value-on-clear="null"
                :disabled="!!saving"
                controls-position="right"
                class="transcription-card__max-pages"
              />
            </el-form-item>
            <el-form-item :label="t('runtimeAdmin.transcription.perDayPages')" :error="problemOf('perDayPages')">
              <el-input-number
                v-model="form.perDayPages"
                :min="1"
                :max="PER_DAY_PAGES_LIMIT"
                :step="100"
                :value-on-clear="null"
                :placeholder="t('runtimeAdmin.money.noLimit')"
                :disabled="!!saving"
                controls-position="right"
                class="transcription-card__per-day"
              />
            </el-form-item>
            <el-form-item :label="t('runtimeAdmin.transcription.concurrency')" :error="problemOf('concurrency')">
              <el-input-number
                v-model="form.concurrency"
                :min="1"
                :max="CONCURRENCY_LIMIT"
                :value-on-clear="null"
                :disabled="!!saving"
                controls-position="right"
                class="transcription-card__concurrency"
              />
            </el-form-item>
          </div>
          <i18n-t
            keypath="runtimeAdmin.transcription.numbersHint"
            tag="p"
            scope="global"
            class="app-form-hint transcription-card__numbers-hint"
          >
            <template #reset><DailyReset /></template>
          </i18n-t>
          <div v-if="changed" class="transcription-card__actions">
            <el-button
              type="primary"
              :loading="saving === 'form'"
              :disabled="Object.keys(problems).length > 0 || (!!saving && saving !== 'form')"
              class="transcription-card__save"
              @click="save"
            >
              {{ t('common.actions.save') }}
            </el-button>
            <el-button :disabled="!!saving" class="transcription-card__undo" @click="undo">
              {{ t('common.actions.cancel') }}
            </el-button>
          </div>
        </el-form>

        <el-alert
          v-if="error"
          type="error"
          show-icon
          :title="adminErrorText(error, t)"
          class="transcription-card__alert transcription-card__error"
          @close="error = null"
        />

        <!-- The credential it calls Core with -->
        <div class="transcription-card__credential" :data-credential="tr.credential.status">
          <h3 class="transcription-card__subtitle">{{ t('runtimeAdmin.transcription.credential.title') }}</h3>
          <div class="transcription-card__credential-row">
            <el-tag
              :type="CREDENTIAL_TAG[tr.credential.status] ?? 'info'"
              size="small"
              disable-transitions
              class="transcription-card__credential-status"
            >
              {{ t(`runtimeAdmin.transcription.credential.status.${tr.credential.status}`) }}
            </el-tag>
            <code v-if="tr.credential.hint" class="transcription-card__hint">{{ tr.credential.hint }}</code>
            <span v-if="tr.credential.status !== 'none'" class="transcription-card__seen">
              <template v-if="tr.credential.last_ok_at">
                {{ t('runtimeAdmin.transcription.credential.lastSeen') }}
                <TimeText :value="tr.credential.last_ok_at" relative />
              </template>
              <template v-else>{{ t('runtimeAdmin.transcription.credential.neverSeen') }}</template>
            </span>
          </div>
          <p v-if="tr.credential.set_at" class="app-muted transcription-card__set">
            <i18n-t
              :keypath="
                tr.credential.set_by
                  ? 'runtimeAdmin.transcription.credential.givenBy'
                  : 'runtimeAdmin.transcription.credential.given'
              "
              tag="span"
              scope="global"
            >
              <template v-if="tr.credential.set_by" #who><ActorLink :id="tr.credential.set_by" /></template>
              <template #when><TimeText :value="tr.credential.set_at" /></template>
            </i18n-t>
          </p>
          <el-alert
            v-if="tr.credential.status === 'rejected'"
            type="error"
            :closable="false"
            show-icon
            :title="t('runtimeAdmin.transcription.credential.rejected')"
            class="transcription-card__alert transcription-card__rejected"
          >
            <code v-if="tr.credential.last_error" class="transcription-card__last-error">{{
              tr.credential.last_error
            }}</code>
          </el-alert>
          <div class="transcription-card__credential-actions">
            <el-button
              :type="tr.credential.status === 'none' || tr.credential.status === 'rejected' ? 'primary' : 'default'"
              :loading="credentialBusy === 'issue'"
              :disabled="!!credentialBusy && credentialBusy !== 'issue'"
              class="transcription-card__issue"
              @click="issue"
            >
              {{
                tr.credential.status === 'none'
                  ? t('runtimeAdmin.transcription.credential.issue')
                  : t('runtimeAdmin.transcription.credential.replace')
              }}
            </el-button>
            <el-button
              v-if="tr.credential.status !== 'none'"
              type="danger"
              plain
              :loading="credentialBusy === 'withdraw'"
              :disabled="!!credentialBusy && credentialBusy !== 'withdraw'"
              class="transcription-card__withdraw"
              @click="withdraw"
            >
              {{ t('runtimeAdmin.transcription.credential.withdraw') }}
            </el-button>
          </div>
          <p class="app-form-hint">{{ t('runtimeAdmin.transcription.credential.hint') }}</p>
          <el-alert
            v-if="credentialError"
            type="error"
            show-icon
            :title="credentialErrorText(credentialError, t)"
            class="transcription-card__alert transcription-card__credential-error"
            @close="credentialError = null"
          />
          <el-alert
            v-if="credentialWarning"
            type="warning"
            show-icon
            :title="credentialWarning"
            class="transcription-card__alert transcription-card__credential-warning"
            @close="credentialWarning = ''"
          />
        </div>

        <!-- Today -->
        <div class="transcription-card__today">
          <h3 class="transcription-card__subtitle">{{ t('runtimeAdmin.transcription.today.title') }}</h3>
          <dl class="transcription-card__stats">
            <div>
              <dt>{{ t('runtimeAdmin.transcription.today.pages') }}</dt>
              <dd class="transcription-card__pages">
                {{ n(tr.today.pages) }}
                <span v-if="tr.per_day_pages" class="transcription-card__of">
                  {{ t('runtimeAdmin.transcription.today.of', { n: n(tr.per_day_pages) }) }}
                </span>
              </dd>
            </div>
            <div>
              <dt>{{ t('runtimeAdmin.transcription.today.documents') }}</dt>
              <dd class="transcription-card__documents">{{ n(tr.today.documents) }}</dd>
            </div>
            <div>
              <dt>{{ t('runtimeAdmin.transcription.today.failed') }}</dt>
              <dd class="transcription-card__failed">{{ n(tr.today.failed) }}</dd>
            </div>
            <div>
              <dt>{{ t('runtimeAdmin.transcription.today.skipped') }}</dt>
              <dd class="transcription-card__skipped">{{ n(tr.today.skipped) }}</dd>
            </div>
            <div>
              <dt>{{ t('runtimeAdmin.transcription.today.cost') }}</dt>
              <dd class="transcription-card__cost">${{ usdShown(tr.today.cost_usd) }}</dd>
            </div>
          </dl>
        </div>

        <TranscriptionJobs />

        <p class="app-muted transcription-card__changed">
          <ChangedBy v-if="tr.updated_at" :by="tr.updated_by" :at="tr.updated_at" />
          <span v-else>{{ t('runtimeAdmin.transcription.neverChanged') }}</span>
        </p>
      </template>
    </RuntimeAsync>
  </section>
</template>

<style scoped>
.transcription-card__title {
  justify-content: flex-start;
  flex-wrap: wrap;
}
.transcription-card__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.transcription-card__not-offered {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.transcription-card__not-offered .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.transcription-card__alert {
  margin-bottom: 16px;
}
.transcription-card__details {
  margin-top: 6px;
}
.transcription-card__details summary {
  cursor: pointer;
}
.transcription-card__details code,
.transcription-card__last-error {
  display: block;
  margin-top: 4px;
  word-break: break-word;
  white-space: pre-wrap;
}
.transcription-card__switch {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.transcription-card__switch-label {
  font-size: 14px;
  font-weight: 600;
}
.transcription-card__switch .app-form-hint {
  margin: 2px 0 0;
}
.transcription-card__offer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}
.transcription-card__offer-select {
  flex: 1 1 260px;
  max-width: 420px;
}
.transcription-card__option-model {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.transcription-card__numbers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0 16px;
}
.transcription-card__numbers :deep(.el-input-number) {
  width: 100%;
}
.transcription-card__numbers-hint {
  margin: -8px 0 12px;
}
.transcription-card__actions,
.transcription-card__credential-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.transcription-card__actions .el-button + .el-button,
.transcription-card__credential-actions .el-button + .el-button {
  margin-left: 0;
}
.transcription-card__subtitle {
  margin: 20px 0 10px;
  font-size: 14px;
  font-weight: 600;
}
.transcription-card__credential,
.transcription-card__today {
  border-top: 1px solid var(--el-border-color-lighter);
}
.transcription-card__credential-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-bottom: 6px;
  font-size: 13px;
}
.transcription-card__hint {
  font-size: 12px;
  word-break: break-all;
}
.transcription-card__seen {
  color: var(--el-text-color-secondary);
}
.transcription-card__set {
  margin: 0 0 10px;
  font-size: 12px;
}
.transcription-card__stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px 16px;
  margin: 0 0 8px;
}
.transcription-card__stats dt {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.transcription-card__stats dd {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.transcription-card__of {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.transcription-card__changed {
  margin: 16px 0 0;
  font-size: 12px;
}
</style>
