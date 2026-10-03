<script setup lang="ts">
// The model and the owner's own API key for a hosted agent (F3; the
// contract's §9.3), which is also the wizard's second step. The runtime
// offers providers on their official endpoints only (GET /models): the owner
// chooses one, an API style where there are several, the endpoint where the
// provider has a choice (a region, an Azure resource), and a model, and
// gives a key. The key can be tried first with one token (POST /keys/test),
// and is saved with PATCH, at the version read (If-Match): a 412 means the
// agent changed elsewhere, so it is read again and the person told, keeping
// what they typed.
//
// Where the runtime offers the school's plan (D8; features.school_key, and
// GET /models' school_key.offers), it is the first choice: the school
// provides the model and pays for it, on a key nobody sees, so the owner
// picks an offer and gives no key. Their own model and key may stand
// behind it, optional, for when the plan's quota for the day is spent;
// "your own key" remains the other choice.
//
// The key is in its password field and nowhere else: never stored in the
// browser, never shown again, never in a log or an error; the field is
// cleared once it is saved, and when the dialog closes. A saved key shows as
// its hint only.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, isVersionMismatch, runtime } from '@/api/runtime'
import type { AgentPatch, HostedAgent, KeyTestAnswer, ModelsAnswer, ProviderOffer, SchoolOffer } from '@/api/runtime-types'
import { REASONING_EFFORTS } from '@/api/runtime-types'
import AppNote from '@/components/AppNote.vue'
import DailyReset from '@/components/DailyReset.vue'
import DataFlowNotice from '@/components/DataFlowNotice.vue'
import {
  FIELD_REASONS,
  MAX_OUTPUT_TOKENS,
  choiceFrom,
  choiceKey,
  defaultsFor,
  emptyModelForm,
  fieldOfPointer,
  formFromModel,
  formProblems,
  hostingErrorText,
  isAishieToken,
  keyProblem,
  offerFor,
  problemsOf,
  type FormField,
  type ModelForm,
} from './hosting'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    agentId: string
    name: string
    /** Shown as the wizard's second step. */
    wizard?: boolean
    /** The runtime takes a model and key of the owner's (features.own_key). */
    ownKey?: boolean
    /** The runtime offers the school's plan (features.school_key). */
    schoolKey?: boolean
  }>(),
  { wizard: false, ownKey: true, schoolKey: false },
)
const emit = defineEmits<{ saved: [agent: HostedAgent] }>()
const { t, te } = useI18n()

const loading = ref(false)
const loadError = shallowRef<unknown>(null)
const offers = shallowRef<ProviderOffer[]>([])
const schoolOffers = shallowRef<SchoolOffer[]>([])
const limits = shallowRef<ModelsAnswer['school_key']['limits'] | null>(null)
const agent = shallowRef<HostedAgent | null>(null)

/** The school's plan, or the owner's own key. */
const plan = ref<'school' | 'own'>('own')
/** The offer of the school's plan chosen. */
const offerId = ref('')
/** On the school's plan: the owner's own model and key stand behind it. */
const fallback = ref(false)
const schoolAvailable = computed(() => props.schoolKey && schoolOffers.value.length > 0)
const ownAvailable = computed(() => props.ownKey && offers.value.length > 0)
/** The provider, model and key fields show: the own key's, or the school plan's fallback. */
const showOwn = computed(() => ownAvailable.value && (plan.value === 'own' || fallback.value))

const form = reactive<ModelForm>(emptyModelForm())
/** The key typed: in its field alone. */
const key = ref('')
const keyMode = ref<'keep' | 'new'>('new')
const advanced = ref<string[]>([])

const testing = ref(false)
const saving = ref(false)
/** The last key test, for exactly these inputs; any edit of the key forgets it. */
const lastTest = shallowRef<(KeyTestAnswer & { choice: string }) | null>(null)
const error = shallowRef<unknown>(null)
const fieldErrors = reactive<Partial<Record<FormField, string>>>({})
const notice = ref('')

const offer = computed(() => offerFor(offers.value, form.provider))
const providerName = computed(() => offer.value?.label ?? form.provider)
const ownKey = computed(() => agent.value?.own_key ?? null)
/** A key is saved for this very provider: it may be kept. */
const canKeep = computed(() => !!ownKey.value && ownKey.value.provider === form.provider && !!form.provider)
const sendingKey = computed(() => !canKeep.value || keyMode.value === 'new')
const models = computed(() => offer.value?.suggested_models ?? [])

function resetMessages() {
  error.value = null
  notice.value = ''
  for (const k of Object.keys(fieldErrors) as FormField[]) delete fieldErrors[k]
}

function takeAgent(a: HostedAgent) {
  agent.value = a
}

async function load() {
  loading.value = true
  loadError.value = null
  resetMessages()
  lastTest.value = null
  key.value = ''
  try {
    const [m, g] = await Promise.all([runtime.models(), runtime.get(props.agentId)])
    offers.value = props.ownKey ? (m.data.own_key?.providers ?? []) : []
    const school = m.data.school_key
    schoolOffers.value = props.schoolKey && school?.offered ? (school.offers ?? []) : []
    limits.value = school?.limits ?? null
    takeAgent(g.data)
    Object.assign(form, formFromModel(g.data.model.own, offers.value))
    if (!form.provider && offers.value.length === 1) Object.assign(form, defaultsFor(form, offers.value[0]))
    keyMode.value = canKeep.value ? 'keep' : 'new'
    const on = g.data.model.school
    offerId.value = schoolOffers.value.find((o) => o.id === on?.offer)?.id ?? schoolOffers.value[0]?.id ?? ''
    // The plan the agent is on; for one with no model yet, the school's when it is offered.
    if (!ownAvailable.value) plan.value = 'school'
    else if (!schoolAvailable.value) plan.value = 'own'
    else plan.value = on || !g.data.model.own ? 'school' : 'own'
    fallback.value = !!on && !!g.data.model.own
  } catch (e) {
    loadError.value = e
  } finally {
    loading.value = false
  }
}

watch(
  open,
  (v) => {
    if (v) void load()
    else {
      key.value = ''
      lastTest.value = null
    }
  },
  { immediate: true },
)

function onProvider(p: string) {
  const o = offerFor(offers.value, p)
  const sameAsSaved = agent.value?.model.own?.provider === p
  Object.assign(form, sameAsSaved ? formFromModel(agent.value?.model.own, offers.value) : defaultsFor(form, o))
  if (!sameAsSaved) form.model = ''
  // A key saved for another provider never goes to this one's host.
  keyMode.value = canKeep.value ? 'keep' : 'new'
  lastTest.value = null
  resetMessages()
}

watch(key, () => {
  lastTest.value = null
  delete fieldErrors.key
})
watch([plan, fallback], () => {
  lastTest.value = null
  resetMessages()
})
watch(offerId, () => delete fieldErrors.offer)

function adapterLabel(a: string): string {
  return te(`hosting.model.adapters.${a}`) ? t(`hosting.model.adapters.${a}`) : a
}

function suggest(query: string, cb: (items: { value: string; priced: boolean }[]) => void) {
  const q = query.trim().toLowerCase()
  cb(models.value.filter((m) => !q || m.model.toLowerCase().includes(q)).map((m) => ({ value: m.model, priced: m.priced })))
}

/** The choice as it stands, or null (with the fields' problems shown) when it cannot be sent. */
function validChoice(needKey: boolean) {
  resetMessages()
  const o = offer.value
  const problems = formProblems(form, o)
  for (const [f, k] of Object.entries(problems)) fieldErrors[f as FormField] = t(k as string)
  if (needKey) {
    const problem = key.value ? keyProblem(key.value) : 'hosting.errors.own_key_required'
    if (problem) fieldErrors.key = t(problem, { provider: providerName.value })
  }
  if (!o || Object.keys(fieldErrors).length) return null
  return choiceFrom(form, o)
}

/**
 * Shows a refusal where it belongs: on its field, or above the form. A key
 * refused as malformed that holds an AIshie token is said to be one.
 */
function showError(e: unknown, sentKey = '') {
  if (isRuntimeError(e) && FIELD_REASONS.has(e.reason)) {
    const f = fieldOfPointer(e.details?.field) ?? (e.reason === 'key_malformed' ? 'key' : null)
    if (f) {
      fieldErrors[f] =
        e.reason === 'key_malformed' && isAishieToken(sentKey)
          ? t('hosting.errors.key_is_aishie_token', { provider: providerName.value })
          : hostingErrorText(e, t, { provider: providerName.value })
      return
    }
  }
  error.value = e
}

const errorText = computed(() => (error.value ? hostingErrorText(error.value, t, { provider: providerName.value }) : ''))
const errorProblems = computed(() => problemsOf(error.value))
const errorDetail = computed(() => (error.value instanceof ApiError ? error.value.message : ''))

async function test() {
  if (testing.value || saving.value) return
  const choice = validChoice(true)
  if (!choice) return
  testing.value = true
  lastTest.value = null
  const sent = key.value
  try {
    const r = await runtime.testKey({ ...choice, key: sent })
    lastTest.value = { ...r.data, choice: choiceKey(choice) }
  } catch (e) {
    showError(e, sent)
  } finally {
    testing.value = false
  }
}

const testText = computed(() => {
  const r = lastTest.value
  if (!r) return ''
  return t(`hosting.keyTest.${r.result}`, {
    provider: providerName.value,
    model: form.model.trim(),
    status: r.http_status ?? '—',
  })
})

/** Whether the key about to be saved passed a test of exactly these inputs. */
function passed(choice: string): boolean {
  const r = lastTest.value
  return !!r && r.choice === choice && (r.result === 'ok' || r.result === 'key_accepted')
}

/**
 * What a save sends: on the school's plan, its offer, and the owner's model
 * (and key) behind it or none; on the owner's key, their model and key, and
 * the agent off the plan. Null, with the fields' problems shown, when it
 * cannot be sent.
 */
function patchOf(): { patch: AgentPatch; choice: ReturnType<typeof validChoice> } | null {
  const a = agent.value!
  if (plan.value === 'school') {
    resetMessages()
    if (!offerId.value) {
      fieldErrors.offer = t('hosting.model.invalid.required')
      return null
    }
    const patch: AgentPatch = { model: { school: { offer: offerId.value } } }
    if (!showOwn.value) {
      if (a.model.own) patch.model!.own = null
      return { patch, choice: null }
    }
    const choice = validChoice(sendingKey.value)
    if (!choice) return null
    patch.model!.own = choice
    return { patch, choice }
  }
  const choice = validChoice(sendingKey.value)
  if (!choice) return null
  const patch: AgentPatch = { model: { own: choice } }
  if (a.model.school) patch.model!.school = null
  return { patch, choice }
}

async function save() {
  if (saving.value || testing.value || !agent.value) return
  const planned = patchOf()
  if (!planned) return
  const { patch, choice } = planned
  const withKey = !!choice && sendingKey.value
  if (choice && withKey && !passed(choiceKey(choice))) {
    const r = lastTest.value
    const result =
      r && r.choice === choiceKey(choice) ? t(`hosting.keyTest.short.${r.result}`) : t('hosting.keyTest.short.none')
    const ok = await ElMessageBox.confirm(t('hosting.model.confirmUntested', { result }), t('hosting.model.confirmUntestedTitle'), {
      type: 'warning',
      confirmButtonText: t('hosting.model.saveAnyway'),
      cancelButtonText: t('common.actions.cancel'),
    }).then(
      () => true,
      () => false,
    )
    if (!ok) return
  }
  const sent = withKey ? key.value : ''
  if (withKey) patch.own_key = { value: sent }
  saving.value = true
  try {
    const r = await runtime.update(agent.value.id, agent.value.version, patch)
    key.value = ''
    lastTest.value = null
    takeAgent(r.data)
    ElMessage({ type: 'success', message: t(plan.value === 'school' ? 'hosting.school.saved' : 'hosting.model.saved') })
    open.value = false
    emit('saved', r.data)
  } catch (e) {
    if (isVersionMismatch(e)) {
      // Read it again, say so, and keep everything typed, the key included.
      try {
        takeAgent((await runtime.get(props.agentId)).data)
        if (!canKeep.value) keyMode.value = 'new'
      } catch (again) {
        showError(again)
      }
      notice.value = t('hosting.model.changedElsewhere')
      return
    }
    showError(e, sent)
  } finally {
    saving.value = false
  }
}

const title = computed(() => t('hosting.model.title', { name: props.name }))
const nothingOffered = computed(() => !ownAvailable.value && !schoolAvailable.value)
/** Nothing complete to save yet: no provider chosen where the provider form shows. */
const incomplete = computed(() => (showOwn.value ? !offer.value : plan.value === 'school' ? !offerId.value : true))
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="600px"
    destroy-on-close
    :close-on-click-modal="!saving && !testing"
    class="model-dialog"
  >
    <el-steps v-if="wizard" :active="1" finish-status="success" simple class="model-dialog__steps">
      <el-step :title="t('hosting.host.steps.agent')" />
      <el-step :title="t('hosting.host.steps.model')" />
    </el-steps>

    <div v-if="loading" v-loading="true" class="model-dialog__loading" />
    <el-alert
      v-else-if="loadError"
      type="error"
      :closable="false"
      show-icon
      :title="hostingErrorText(loadError, t)"
      class="model-dialog__alert"
    >
      <el-button size="small" @click="load">{{ t('common.actions.retry') }}</el-button>
    </el-alert>
    <AppNote v-else-if="nothingOffered">{{ t('hosting.model.noProviders') }}</AppNote>
    <template v-else>
      <el-alert
        v-if="notice"
        type="warning"
        :closable="false"
        show-icon
        :title="notice"
        class="model-dialog__alert model-dialog__notice"
      />
      <el-form label-position="top" class="model-form" @submit.prevent>
        <el-radio-group v-if="schoolAvailable && ownAvailable" v-model="plan" class="model-form__plans">
          <el-radio value="school" border class="model-form__plan model-form__plan--school">
            <span class="model-form__plan-title">{{ t('hosting.school.choice') }}</span>
            <span class="model-form__plan-hint">{{ t('hosting.school.choiceHint') }}</span>
          </el-radio>
          <el-radio value="own" border class="model-form__plan model-form__plan--own">
            <span class="model-form__plan-title">{{ t('hosting.school.own') }}</span>
            <span class="model-form__plan-hint">{{ t('hosting.school.ownHint') }}</span>
          </el-radio>
        </el-radio-group>

        <template v-if="plan === 'school'">
          <el-form-item :label="t('hosting.school.offer')" :error="fieldErrors.offer" class="model-form__school">
            <el-radio-group v-model="offerId" class="model-form__offers">
              <el-radio v-for="o in schoolOffers" :key="o.id" :value="o.id" class="model-form__offer">
                <span class="model-form__offer-label">{{ o.label }}</span>
                <span v-if="o.model && !o.label.includes(o.model)" class="app-muted model-form__offer-model">{{ o.model }}</span>
              </el-radio>
            </el-radio-group>
            <i18n-t
              v-if="limits"
              keypath="hosting.school.limits"
              tag="div"
              scope="global"
              class="app-form-hint model-form__limits"
            >
              <template #owner>{{ limits.per_owner_day }}</template>
              <template #asker>{{ limits.per_asker_day }}</template>
              <template #reset><DailyReset :since="agent?.today.since" /></template>
            </i18n-t>
            <div class="app-form-hint">{{ t('hosting.school.noKey') }}</div>
          </el-form-item>
          <DataFlowNotice class="model-dialog__alert model-form__school-warning">
            {{ t('hosting.school.warning') }}
          </DataFlowNotice>
          <div v-if="ownAvailable" class="model-form__fallback">
            <h4 class="model-form__fallback-title">{{ t('hosting.school.fallbackTitle') }}</h4>
            <el-checkbox v-model="fallback" class="model-form__fallback-on">{{ t('hosting.school.fallbackOn') }}</el-checkbox>
            <div class="app-form-hint">{{ t('hosting.school.fallbackHint') }}</div>
          </div>
        </template>

        <template v-if="showOwn">
        <el-form-item :label="t('hosting.model.provider')" :error="fieldErrors.provider">
          <el-select
            :model-value="form.provider"
            :placeholder="t('hosting.model.providerPlaceholder')"
            class="model-form__provider"
            @update:model-value="onProvider"
          >
            <el-option v-for="o in offers" :key="o.provider" :value="o.provider" :label="o.label" />
          </el-select>
        </el-form-item>

        <template v-if="offer">
          <el-form-item v-if="offer.adapters.length > 1" :label="t('hosting.model.adapter')" :error="fieldErrors.adapter">
            <el-select v-model="form.adapter" class="model-form__adapter">
              <el-option v-for="a in offer.adapters" :key="a" :value="a" :label="adapterLabel(a)" />
            </el-select>
          </el-form-item>

          <el-form-item
            v-if="offer.endpoint.kind === 'choice'"
            :label="t('hosting.model.endpoint')"
            :error="fieldErrors.endpoint"
          >
            <el-select v-model="form.endpoint" class="model-form__endpoint">
              <el-option v-for="c in offer.endpoint.choices" :key="c.id" :value="c.id" :label="c.label" />
            </el-select>
          </el-form-item>
          <el-form-item
            v-else-if="offer.endpoint.kind === 'azure_resource'"
            :label="t('hosting.model.resource')"
            :error="fieldErrors.resource"
          >
            <el-input v-model="form.resource" :placeholder="offer.endpoint.example" class="model-form__resource" />
            <div class="app-form-hint">{{ t('hosting.model.resourceHint', { example: offer.endpoint.example }) }}</div>
          </el-form-item>
          <el-form-item
            v-else-if="offer.endpoint.kind === 'bedrock_region'"
            :label="t('hosting.model.region')"
            :error="fieldErrors.region"
          >
            <el-select v-model="form.region" filterable allow-create default-first-option class="model-form__region">
              <el-option v-for="r in offer.endpoint.suggested" :key="r" :value="r" :label="r" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('hosting.model.model')" :error="fieldErrors.model">
            <el-autocomplete
              v-model="form.model"
              :fetch-suggestions="suggest"
              :placeholder="t('hosting.model.modelPlaceholder')"
              clearable
              class="model-form__model"
            >
              <template #default="{ item }">
                <span>{{ item.value }}</span>
                <span v-if="!item.priced" class="app-muted model-form__unpriced">{{ t('hosting.model.priceUnknown') }}</span>
              </template>
            </el-autocomplete>
          </el-form-item>

          <el-form-item :label="t('hosting.model.key')" :error="fieldErrors.key">
            <el-radio-group v-if="canKeep" v-model="keyMode" class="model-form__keymode">
              <el-radio value="keep">{{ t('hosting.model.keyKeep', { hint: ownKey?.hint ?? '' }) }}</el-radio>
              <el-radio value="new">{{ t('hosting.model.keyNew') }}</el-radio>
            </el-radio-group>
            <el-input
              v-if="sendingKey"
              v-model="key"
              type="password"
              autocomplete="off"
              name="aishie-model-key"
              :placeholder="
                offer.key_prefix
                  ? t('hosting.model.keyPlaceholderPrefix', { provider: providerName, prefix: offer.key_prefix })
                  : t('hosting.model.keyPlaceholder', { provider: providerName })
              "
              class="model-form__key"
            />
            <div class="app-form-hint">{{ t('hosting.model.keyNotStored') }}</div>
          </el-form-item>

          <el-collapse v-model="advanced" class="model-form__advanced">
            <el-collapse-item name="advanced" :title="t('hosting.model.advanced')">
              <el-form-item :label="t('hosting.model.maxOutputTokens')" :error="fieldErrors.maxOutputTokens">
                <el-input-number
                  v-model="form.maxOutputTokens"
                  :min="MAX_OUTPUT_TOKENS.min"
                  :max="MAX_OUTPUT_TOKENS.max"
                  :step="256"
                  :precision="0"
                  :value-on-clear="null"
                  controls-position="right"
                />
                <div class="app-form-hint">{{ t('hosting.model.maxOutputTokensHint') }}</div>
              </el-form-item>
              <el-form-item :label="t('hosting.model.reasoningEffort')" :error="fieldErrors.reasoningEffort">
                <el-select
                  v-model="form.reasoningEffort"
                  clearable
                  value-on-clear=""
                  :placeholder="t('hosting.model.reasoningDefault')"
                  class="model-form__effort"
                >
                  <el-option v-for="e in REASONING_EFFORTS" :key="e" :value="e" :label="t(`hosting.model.effort.${e}`)" />
                </el-select>
              </el-form-item>
            </el-collapse-item>
          </el-collapse>

          <DataFlowNotice class="model-dialog__alert model-form__own-warning">
            {{ t('hosting.model.warning', { provider: providerName }) }}
          </DataFlowNotice>
        </template>
        </template>
      </el-form>

      <!-- Its type in the template, where lint reads it: a key that works is green, a refused one red, the rest amber. -->
      <el-alert
        v-if="lastTest"
        :type="lastTest.result === 'ok' ? 'success' : lastTest.result === 'key_refused' ? 'error' : 'warning'"
        :closable="false"
        show-icon
        :title="testText"
        class="model-dialog__alert model-dialog__test"
      />
      <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="model-dialog__alert model-dialog__error">
        <details v-if="errorProblems.length || errorDetail" class="model-dialog__details">
          <summary>{{ t('hosting.errors.details') }}</summary>
          <ul v-if="errorProblems.length">
            <li v-for="(p, i) in errorProblems" :key="i">{{ p }}</li>
          </ul>
          <p v-else>{{ errorDetail }}</p>
        </details>
      </el-alert>
    </template>

    <template #footer>
      <el-button :disabled="saving" @click="open = false">
        {{ wizard ? t('hosting.model.later') : t('common.actions.cancel') }}
      </el-button>
      <el-button
        v-if="showOwn && offer && sendingKey"
        class="model-dialog__test-button"
        :loading="testing"
        :disabled="saving || !key"
        @click="test"
      >
        {{ t('hosting.model.test') }}
      </el-button>
      <el-button
        type="primary"
        class="model-dialog__save"
        :loading="saving"
        :disabled="testing || loading || incomplete || !agent"
        @click="save"
      >
        {{ t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.model-dialog__steps {
  margin-bottom: 16px;
}
.model-dialog__loading {
  min-height: 160px;
}
.model-dialog__alert {
  margin-top: 12px;
}
.model-dialog__notice {
  margin: 0 0 12px;
}
.model-form :deep(.el-select),
.model-form :deep(.el-autocomplete) {
  width: 100%;
}
.model-form__plans {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 16px;
}
.model-form__plans .el-radio {
  height: auto;
  margin-right: 0;
  padding: 10px 12px;
  align-items: flex-start;
  white-space: normal;
}
.model-form__plans :deep(.el-radio__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.model-form__plan-title {
  font-weight: 600;
}
.model-form__plan-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.model-form__offers {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.model-form__offer-model {
  margin-left: 8px;
  font-size: 12px;
}
.model-form__limits {
  margin-top: 4px;
}
.model-form__school-warning {
  margin: 0 0 16px;
}
.model-form__fallback {
  margin: 0 0 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.model-form__fallback-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}
.model-form__keymode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 8px;
}
.model-form__unpriced {
  margin-left: 8px;
  font-size: 12px;
}
.model-form__advanced {
  margin-bottom: 8px;
}
.model-dialog__details summary {
  cursor: pointer;
}
.model-dialog__details ul,
.model-dialog__details p {
  margin: 4px 0 0;
  padding-left: 18px;
  word-break: break-word;
}
</style>
