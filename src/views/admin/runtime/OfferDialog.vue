<script setup lang="ts">
// Adding a model to the school's plan, or editing one of the site's (POST
// and PATCH admin/school-plan/offers). The model is chosen as an owner's own
// model is (the hosting pages' form): a provider the runtime takes keys for,
// its API style where it has several, the endpoint, Azure resource or AWS
// region where it takes one, and the model; with an ID agents name it by, a
// name owners are shown, and the school's key for it.
//
// The key is write-only: it is in its password field and nowhere else, never
// shown again, never in a log or an error, and cleared once saved and when
// the dialog closes. Editing, the key kept shows as its hint, and is replaced
// only when asked (or for another provider, which needs its own). The
// runtime tries a key with the provider before keeping it, unless told not
// to; a trial that fails keeps nothing, and says what the provider answered.
//
// An edit sends only what changed from the offer as read, at its version
// (If-Match). When it has changed meanwhile (412), it is read again, what
// the administrator changed is kept over it, and they are told so.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { isRuntimeError, isVersionMismatch, runtimeAdmin } from '@/api/runtime'
import type { OfferPatch, PlanOffer, ProviderOffer } from '@/api/runtime-types'
import { REASONING_EFFORTS } from '@/api/runtime-types'
import {
  MAX_OUTPUT_TOKENS,
  defaultsFor,
  emptyModelForm,
  isAishieToken,
  offerFor,
  type ModelForm,
} from '@/views/account/components/agents/hosting'
import {
  OFFER_LABEL_MAX,
  adminErrorText,
  formFromOffer,
  keyTrialDetail,
  keyTrialOf,
  keyTrialText,
  offerCreateFrom,
  offerFieldOf,
  offerPatchFrom,
  offerProblems,
  retestsKey,
  type KeyTrial,
  type OfferField,
  type OfferMeta,
  type UnpricedItem,
} from './runtimeAdmin'
import UnpricedNotice from './UnpricedNotice.vue'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{
  /** The site's offer to edit, or null to add one. */
  offer: PlanOffer | null
  providers: ProviderOffer[] | null
  providersError?: unknown
  /** The ids the plan has already, runtime.yaml's and the site's. */
  takenIds: readonly string[]
}>()
const emit = defineEmits<{
  saved: [offer: PlanOffer]
  /** The plan should be read again: the offer changed or went meanwhile. */
  changed: []
  reloadProviders: []
}>()
const { t, te } = useI18n()

const creating = computed(() => !props.offer)
const providers = computed(() => props.providers ?? [])
/** The offer as last read: what an edit is made to, and at which version. */
const base = shallowRef<PlanOffer | null>(null)

const meta = reactive<OfferMeta>({ id: '', label: '', enabled: true })
const form = reactive<ModelForm>(emptyModelForm())
/** The form as the offer was read, to send only what changed from it. */
let initial: ModelForm = emptyModelForm()
/** The key typed: in its field alone. */
const key = ref('')
const keyMode = ref<'keep' | 'new'>('new')
const skipKeyTest = ref(false)
const advanced = ref<string[]>([])

const saving = ref(false)
const error = shallowRef<unknown>(null)
const trial = shallowRef<KeyTrial | null>(null)
const fieldErrors = reactive<Partial<Record<OfferField, string>>>({})
const notice = ref('')
/** The model offered has no price, and a quota in dollars needs one: a price may be added from here. */
const unpriced = shallowRef<UnpricedItem[]>([])

const provider = computed(() => offerFor(providers.value, form.provider))
const providerName = computed(() => provider.value?.label ?? form.provider)
const models = computed(() => provider.value?.suggested_models ?? [])
/** Editing, with the provider the key was given for: the key may be kept. */
const canKeep = computed(() => !!base.value?.key_hint && form.provider === base.value.provider)
const sendingKey = computed(() => !canKeep.value || keyMode.value === 'new')

function resetMessages() {
  error.value = null
  trial.value = null
  notice.value = ''
  unpriced.value = []
  for (const k of Object.keys(fieldErrors) as OfferField[]) delete fieldErrors[k]
}

/** The dialog as it opens: the offer to edit, or an empty one with the only provider chosen when there is one. */
function start() {
  resetMessages()
  key.value = ''
  skipKeyTest.value = false
  advanced.value = []
  const o = props.offer
  base.value = o
  if (o) {
    Object.assign(meta, { id: o.id, label: o.label, enabled: o.enabled })
    Object.assign(form, formFromOffer(o, providers.value))
    if (form.maxOutputTokens !== null || form.reasoningEffort) advanced.value = ['advanced']
  } else {
    Object.assign(meta, { id: '', label: '', enabled: true })
    Object.assign(form, emptyModelForm())
    if (providers.value.length === 1) Object.assign(form, defaultsFor(form, providers.value[0]))
  }
  initial = { ...form }
  keyMode.value = canKeep.value ? 'keep' : 'new'
}

watch(
  open,
  (v) => {
    if (v) start()
    else key.value = ''
  },
  { immediate: true },
)
// The providers read only once it was open (nothing could be typed meanwhile): the form is made with them.
watch(
  () => props.providers,
  (now, before) => {
    if (open.value && now && !before) start()
  },
)

function onProvider(p: string) {
  const o = offerFor(providers.value, p)
  const b = base.value
  const same = !!b && b.provider === p
  Object.assign(form, same ? formFromOffer(b, providers.value) : defaultsFor(form, o))
  if (!same) form.model = ''
  keyMode.value = canKeep.value ? 'keep' : 'new'
  resetMessages()
}

watch(key, () => {
  trial.value = null
  delete fieldErrors.key
})
watch(
  () => meta.id,
  () => delete fieldErrors.id,
)
watch(
  () => meta.label,
  () => delete fieldErrors.label,
)
watch(
  () => form.model,
  () => delete fieldErrors.model,
)

function adapterLabel(a: string): string {
  return te(`hosting.model.adapters.${a}`) ? t(`hosting.model.adapters.${a}`) : a
}

function suggest(query: string, cb: (items: { value: string; priced: boolean }[]) => void) {
  const q = query.trim().toLowerCase()
  cb(
    models.value
      .filter((m) => !q || m.model.toLowerCase().includes(q))
      .map((m) => ({ value: m.model, priced: m.priced })),
  )
}

/** The change an edit would send now (empty when nothing changed). */
function patchNow(): OfferPatch {
  if (!base.value) return {}
  return offerPatchFrom({
    offer: base.value,
    initial,
    meta,
    form,
    provider: provider.value,
    key: sendingKey.value ? key.value : null,
    skipKeyTest: skipKeyTest.value,
  })
}
/** Editing the model without a new key: the key kept was tried with another, and will show as untested. */
const retests = computed(() => !creating.value && !sendingKey.value && retestsKey(patchNow()))

/** The words for a refusal on its field. */
function fieldText(e: unknown, sent: string): string {
  if (!isRuntimeError(e)) return adminErrorText(e, t)
  if (e.reason === 'missing_field') return t('hosting.model.invalid.required')
  if (e.reason === 'invalid_field') return t('hosting.errors.invalid_field')
  if (e.reason === 'key_malformed' && isAishieToken(sent)) {
    return t('hosting.errors.key_is_aishie_token', { provider: providerName.value })
  }
  return adminErrorText(e, t, { provider: providerName.value })
}

const FIELD_REASONS: ReadonlySet<string> = new Set([
  'missing_field',
  'invalid_field',
  'unknown_provider',
  'adapter_not_offered',
  'unknown_endpoint',
  'key_malformed',
  'offer_exists',
  'model_denied',
  'offer_not_priced',
  'key_required',
])
/** Whether the form shows a field now, where a refusal of it may be said. */
function shows(f: OfferField): boolean {
  const kind = provider.value?.endpoint.kind
  switch (f) {
    case 'id':
      return creating.value
    case 'adapter':
      return (provider.value?.adapters.length ?? 0) > 1
    case 'endpoint':
      return kind === 'choice'
    case 'resource':
      return kind === 'azure_resource'
    case 'region':
      return kind === 'bedrock_region'
    case 'enabled':
    case 'offer':
      return false
    default:
      return true
  }
}

/** Shows a refusal where it belongs: a failed trial with what the provider said, on its field, or above the form. */
function showError(e: unknown, sent: string) {
  const failed = keyTrialOf(e)
  if (failed) {
    trial.value = failed
    return
  }
  if (isRuntimeError(e) && e.reason === 'offer_not_priced') {
    unpriced.value = [
      {
        id: base.value?.id ?? meta.id.trim(),
        label: meta.label.trim(),
        provider: form.provider,
        model: form.model.trim(),
      },
    ]
  }
  if (isRuntimeError(e) && FIELD_REASONS.has(e.reason)) {
    const f =
      offerFieldOf(e.details?.field) ?? (e.reason === 'key_malformed' || e.reason === 'key_required' ? 'key' : null)
    if (f && shows(f)) {
      if (f === 'maxOutputTokens' || f === 'reasoningEffort') advanced.value = ['advanced']
      if (f === 'key' && !sendingKey.value) keyMode.value = 'new'
      fieldErrors[f] = fieldText(e, sent)
      return
    }
  }
  error.value = e
}

const trialTitle = computed(() =>
  trial.value ? keyTrialText(trial.value, t, { provider: providerName.value, model: form.model.trim() }) : '',
)
const trialDetail = computed(() => (trial.value ? keyTrialDetail(trial.value, t) : ''))

/** Reads the offer again after a 412, and keeps what was changed here over it. */
async function rebase() {
  const b = base.value
  if (!b) return
  const fresh = (await runtimeAdmin.offer(b.id)).data
  const freshForm = formFromOffer(fresh, providers.value)
  for (const k of Object.keys(form) as (keyof ModelForm)[]) {
    if (form[k] === initial[k]) (form as Record<string, unknown>)[k] = freshForm[k]
  }
  if (meta.label.trim() === b.label) meta.label = fresh.label
  if (meta.enabled === b.enabled) meta.enabled = fresh.enabled
  base.value = fresh
  initial = freshForm
  if (!canKeep.value) keyMode.value = 'new'
}

async function save() {
  if (saving.value) return
  resetMessages()
  const problems = offerProblems({
    meta,
    form,
    provider: provider.value,
    creating: creating.value,
    takenIds: props.takenIds,
    sendingKey: sendingKey.value,
    key: key.value,
  })
  for (const [f, k] of Object.entries(problems))
    fieldErrors[f as OfferField] = t(k as string, { provider: providerName.value })
  if (problems.maxOutputTokens) advanced.value = ['advanced']
  if (Object.keys(problems).length || !provider.value) return

  const sent = sendingKey.value ? key.value : ''
  saving.value = true
  try {
    if (creating.value) {
      const r = await runtimeAdmin.createOffer(
        offerCreateFrom({ meta, form, provider: provider.value, key: sent, skipKeyTest: skipKeyTest.value }),
      )
      done(
        r.data,
        r.data.key_status === 'untested' ? 'runtimeAdmin.offer.createdUntested' : 'runtimeAdmin.offer.created',
      )
    } else {
      const b = base.value!
      const patch = patchNow()
      if (!Object.keys(patch).length) {
        open.value = false
        return
      }
      const r = await runtimeAdmin.updateOffer(b.id, b.version ?? 0, patch)
      const untested = r.data.key_status === 'untested' && b.key_status === 'tested'
      done(r.data, untested ? 'runtimeAdmin.offer.savedUntested' : 'runtimeAdmin.offer.saved')
    }
  } catch (e) {
    if (isVersionMismatch(e)) {
      try {
        await rebase()
        notice.value = t('runtimeAdmin.offer.changedElsewhere')
      } catch (again) {
        if (!onGone(again)) showError(again, sent)
      }
      return
    }
    if (!onGone(e)) showError(e, sent)
  } finally {
    saving.value = false
  }
}

function done(o: PlanOffer, words: string) {
  key.value = ''
  ElMessage({ type: 'success', message: t(words, { label: o.label }) })
  open.value = false
  emit('saved', o)
}

/** The offer was deleted meanwhile: said, the dialog closed, the plan read again. */
function onGone(e: unknown): boolean {
  if (!isRuntimeError(e) || e.reason !== 'offer_not_found' || creating.value) return false
  ElMessage({ type: 'info', message: t('runtimeAdmin.errors.offer_not_found') })
  open.value = false
  emit('changed')
  return true
}

const title = computed(() =>
  props.offer ? t('runtimeAdmin.offer.editTitle', { label: props.offer.label }) : t('runtimeAdmin.offer.createTitle'),
)
const errorText = computed(() => (error.value ? adminErrorText(error.value, t, { provider: providerName.value }) : ''))
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="600px"
    destroy-on-close
    :close-on-click-modal="!saving"
    class="offer-dialog"
  >
    <div
      v-if="!providers.length && !providersError && props.providers === null"
      v-loading="true"
      class="offer-dialog__loading"
    />
    <el-alert
      v-else-if="providersError && !providers.length"
      type="error"
      :closable="false"
      show-icon
      :title="t('runtimeAdmin.offer.providersFailed')"
      :description="adminErrorText(providersError, t)"
      class="offer-dialog__alert offer-dialog__providers-failed"
    >
      <el-button size="small" @click="emit('reloadProviders')">{{ t('common.actions.retry') }}</el-button>
    </el-alert>
    <el-alert
      v-else-if="!providers.length"
      type="info"
      :closable="false"
      show-icon
      :title="t('runtimeAdmin.offer.noProviders')"
      class="offer-dialog__alert offer-dialog__no-providers"
    />
    <template v-else>
      <el-alert
        v-if="notice"
        type="warning"
        :closable="false"
        show-icon
        :title="notice"
        class="offer-dialog__alert offer-dialog__notice"
      />
      <el-form label-position="top" class="offer-form" @submit.prevent>
        <el-form-item v-if="creating" :label="t('runtimeAdmin.offer.id')" :error="fieldErrors.id">
          <el-input v-model="meta.id" maxlength="64" autocomplete="off" spellcheck="false" class="offer-form__id" />
          <div class="app-form-hint">{{ t('runtimeAdmin.offer.idHint') }}</div>
        </el-form-item>
        <el-form-item v-else :label="t('runtimeAdmin.offer.id')">
          <code class="offer-form__id-fixed">{{ offer?.id }}</code>
        </el-form-item>

        <el-form-item :label="t('runtimeAdmin.offer.label')" :error="fieldErrors.label">
          <el-input v-model="meta.label" :maxlength="OFFER_LABEL_MAX" show-word-limit class="offer-form__label" />
          <div class="app-form-hint">{{ t('runtimeAdmin.offer.labelHint') }}</div>
        </el-form-item>

        <div class="offer-form__switch">
          <el-switch v-model="meta.enabled" id="offer-enabled" class="offer-form__enabled" />
          <div>
            <label for="offer-enabled" class="offer-form__switch-label">{{ t('runtimeAdmin.offer.enabled') }}</label>
            <p class="app-form-hint">{{ t('runtimeAdmin.offer.enabledHint') }}</p>
          </div>
        </div>

        <h3 class="offer-form__section">{{ t('runtimeAdmin.offer.modelSection') }}</h3>
        <el-form-item :label="t('hosting.model.provider')" :error="fieldErrors.provider">
          <el-select
            :model-value="form.provider"
            :placeholder="t('hosting.model.providerPlaceholder')"
            class="offer-form__provider"
            @update:model-value="onProvider"
          >
            <el-option v-for="o in providers" :key="o.provider" :value="o.provider" :label="o.label" />
          </el-select>
        </el-form-item>

        <template v-if="provider">
          <el-form-item
            v-if="provider.adapters.length > 1"
            :label="t('hosting.model.adapter')"
            :error="fieldErrors.adapter"
          >
            <el-select v-model="form.adapter" class="offer-form__adapter">
              <el-option v-for="a in provider.adapters" :key="a" :value="a" :label="adapterLabel(a)" />
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="provider.endpoint.kind === 'choice'"
            :label="t('hosting.model.endpoint')"
            :error="fieldErrors.endpoint"
          >
            <el-select v-model="form.endpoint" class="offer-form__endpoint">
              <el-option v-for="c in provider.endpoint.choices" :key="c.id" :value="c.id" :label="c.label" />
            </el-select>
          </el-form-item>
          <el-form-item
            v-else-if="provider.endpoint.kind === 'azure_resource'"
            :label="t('hosting.model.resource')"
            :error="fieldErrors.resource"
          >
            <el-input v-model="form.resource" :placeholder="provider.endpoint.example" class="offer-form__resource" />
            <div class="app-form-hint">
              {{ t('hosting.model.resourceHint', { example: provider.endpoint.example }) }}
            </div>
          </el-form-item>
          <el-form-item
            v-else-if="provider.endpoint.kind === 'bedrock_region'"
            :label="t('hosting.model.region')"
            :error="fieldErrors.region"
          >
            <el-select v-model="form.region" filterable allow-create default-first-option class="offer-form__region">
              <el-option v-for="r in provider.endpoint.suggested" :key="r" :value="r" :label="r" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('hosting.model.model')" :error="fieldErrors.model">
            <el-autocomplete
              v-model="form.model"
              :fetch-suggestions="suggest"
              :placeholder="t('hosting.model.modelPlaceholder')"
              clearable
              class="offer-form__model"
            >
              <template #default="{ item }">
                <span>{{ item.value }}</span>
                <span v-if="!item.priced" class="app-muted offer-form__unpriced">{{
                  t('hosting.model.priceUnknown')
                }}</span>
              </template>
            </el-autocomplete>
          </el-form-item>

          <el-form-item :label="t('runtimeAdmin.offer.key')" :error="fieldErrors.key">
            <el-radio-group v-if="canKeep" v-model="keyMode" class="offer-form__keymode">
              <el-radio value="keep">
                {{ t('runtimeAdmin.offer.keyKeep', { hint: base?.key_hint ?? '' }) }}
                <el-tag
                  v-if="base?.key_status"
                  :type="base.key_status === 'tested' ? 'success' : 'warning'"
                  effect="plain"
                  size="small"
                  disable-transitions
                  class="offer-form__key-status"
                >
                  {{ t(`runtimeAdmin.offers.${base.key_status}`) }}
                </el-tag>
              </el-radio>
              <el-radio value="new">{{ t('runtimeAdmin.offer.keyNew') }}</el-radio>
            </el-radio-group>
            <p v-else-if="base" class="app-form-hint offer-form__other-provider">
              {{ t('runtimeAdmin.offer.keyOtherProvider') }}
            </p>
            <template v-if="sendingKey">
              <el-input
                v-model="key"
                type="password"
                autocomplete="off"
                name="aishie-school-key"
                :placeholder="
                  provider.key_prefix
                    ? t('runtimeAdmin.offer.keyPlaceholderPrefix', {
                        provider: providerName,
                        prefix: provider.key_prefix,
                      })
                    : t('runtimeAdmin.offer.keyPlaceholder', { provider: providerName })
                "
                class="offer-form__key"
              />
              <div class="app-form-hint">{{ t('runtimeAdmin.offer.keyHint', { provider: providerName }) }}</div>
              <el-checkbox v-model="skipKeyTest" class="offer-form__skip">{{
                t('runtimeAdmin.offer.skipTest')
              }}</el-checkbox>
              <el-alert
                v-if="skipKeyTest"
                type="warning"
                :closable="false"
                show-icon
                :title="t('runtimeAdmin.offer.skipTestWarning', { provider: providerName })"
                class="offer-dialog__alert offer-form__skip-warning"
              />
            </template>
          </el-form-item>
          <el-alert
            v-if="retests"
            type="info"
            :closable="false"
            show-icon
            :title="t('runtimeAdmin.offer.retests')"
            class="offer-dialog__alert offer-form__retests"
          />

          <el-collapse v-model="advanced" class="offer-form__advanced">
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
                  class="offer-form__max-tokens"
                />
                <div class="app-form-hint">{{ t('hosting.model.maxOutputTokensHint') }}</div>
              </el-form-item>
              <el-form-item :label="t('hosting.model.reasoningEffort')" :error="fieldErrors.reasoningEffort">
                <el-select
                  v-model="form.reasoningEffort"
                  clearable
                  value-on-clear=""
                  :placeholder="t('hosting.model.reasoningDefault')"
                  class="offer-form__effort"
                >
                  <el-option
                    v-for="e in REASONING_EFFORTS"
                    :key="e"
                    :value="e"
                    :label="t(`hosting.model.effort.${e}`)"
                  />
                </el-select>
              </el-form-item>
            </el-collapse-item>
          </el-collapse>

          <el-alert
            type="warning"
            :closable="false"
            show-icon
            :title="t('runtimeAdmin.offer.warning', { provider: providerName })"
            class="offer-dialog__alert"
          />
        </template>
      </el-form>

      <UnpricedNotice
        v-if="unpriced.length"
        :items="unpriced"
        :title="t('runtimeAdmin.offer.unpricedTitle')"
        :providers="providers"
        class="offer-dialog__alert offer-dialog__unpriced"
      />
      <el-alert
        v-if="trial"
        type="error"
        :closable="false"
        show-icon
        :title="trialTitle"
        class="offer-dialog__alert offer-dialog__trial"
      >
        <p class="offer-dialog__trial-text">{{ t('runtimeAdmin.offer.trialNothingKept') }}</p>
        <p v-if="trialDetail" class="offer-dialog__trial-detail">{{ trialDetail }}</p>
      </el-alert>
      <el-alert
        v-if="error"
        type="error"
        :closable="false"
        show-icon
        :title="errorText"
        class="offer-dialog__alert offer-dialog__error"
      />
    </template>

    <template #footer>
      <el-button :disabled="saving" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" class="offer-dialog__save" :loading="saving" :disabled="!provider" @click="save">
        {{ creating ? t('runtimeAdmin.offer.add') : t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.offer-dialog__loading {
  min-height: 160px;
}
.offer-dialog__alert {
  margin-top: 12px;
}
.offer-dialog__notice {
  margin: 0 0 12px;
}
.offer-form :deep(.el-select),
.offer-form :deep(.el-autocomplete) {
  width: 100%;
}
.offer-form__id-fixed {
  font-size: var(--app-text-sm);
}
.offer-form__switch {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}
.offer-form__switch-label {
  font-weight: var(--app-weight-strong);
  font-size: var(--app-text-md);
}
.offer-form__switch .app-form-hint {
  margin: 2px 0 0;
}
.offer-form__section {
  margin: 8px 0 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.offer-form__keymode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 8px;
}
.offer-form__key-status {
  margin-left: 6px;
}
.offer-form__other-provider {
  margin: 0 0 6px;
}
.offer-form__skip {
  margin-top: 6px;
}
.offer-form__skip-warning {
  margin-top: 6px;
}
.offer-form__unpriced {
  margin-left: 8px;
  font-size: var(--app-text-xs);
}
.offer-form__advanced {
  margin: 12px 0 8px;
}
.offer-dialog__trial-text,
.offer-dialog__trial-detail {
  margin: 4px 0 0;
  line-height: var(--app-lh-ui);
}
.offer-dialog__trial-detail {
  font-size: var(--app-text-xs);
  word-break: break-word;
}
</style>
