<script setup lang="ts">
// The school's plan's daily quotas (PUT and DELETE admin/school-plan/
// quotas), in answers and in dollars: per owner across their agents, per
// person asking one agent in one course, and for the whole school. The two
// in answers per person are required; the rest may be no limit.
// runtime.yaml's are the defaults, shown beside each field; once set here
// they stand in place of those until they are reset.
//
// A quota in dollars needs a price today for every model of the plan (and
// those of the agents on it): a refusal that says which offers have none
// lists them, each with "Add a price", to try again after; one that says
// which agents' models have none lists them, with the way to the prices. A
// runtime from before the quotas in dollars has none to show: only those in
// answers are sent then, and it keeps what it has.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { PlanQuotas, ProviderOffer, QuotasPut, SchoolPlan } from '@/api/runtime-types'
import DailyReset from '@/components/DailyReset.vue'
import { problemsOf } from '@/views/account/components/agents/hosting'
import ChangedBy from './ChangedBy.vue'
import UnpricedNotice from './UnpricedNotice.vue'
import {
  QUOTA_MAX,
  adminErrorText,
  quotaProblem,
  sameUsd,
  unpricedIds,
  unpricedItems,
  usdField,
  usdProblem,
  usdSent,
  usdShown,
  type UnpricedItem,
} from './runtimeAdmin'

const props = defineProps<{ plan: SchoolPlan; providers?: ProviderOffer[] | null }>()
const emit = defineEmits<{ update: [plan: SchoolPlan] }>()
const { t } = useI18n()

type Answers = 'per_owner_day' | 'per_asker_day' | 'per_day'
type Dollars = 'per_owner_day_usd' | 'per_asker_day_usd' | 'per_day_usd'
const SCOPES: { key: Answers; usd: Dollars; label: string; hint: string; required: boolean }[] = [
  {
    key: 'per_owner_day',
    usd: 'per_owner_day_usd',
    label: 'runtimeAdmin.quotas.perOwner',
    hint: 'runtimeAdmin.quotas.perOwnerHint',
    required: true,
  },
  {
    key: 'per_asker_day',
    usd: 'per_asker_day_usd',
    label: 'runtimeAdmin.quotas.perAsker',
    hint: 'runtimeAdmin.quotas.perAskerHint',
    required: true,
  },
  {
    key: 'per_day',
    usd: 'per_day_usd',
    label: 'runtimeAdmin.quotas.perDay',
    hint: 'runtimeAdmin.quotas.perDayHint',
    required: false,
  },
]

/** The runtime has quotas in dollars for the site to set. */
const dollars = computed(() => props.plan.quotas.per_owner_day_usd !== undefined)

interface Form {
  per_owner_day: number | null
  per_asker_day: number | null
  per_day: number | null
  per_owner_day_usd: string
  per_asker_day_usd: string
  per_day_usd: string
}
const form = reactive<Form>({
  per_owner_day: null,
  per_asker_day: null,
  per_day: null,
  per_owner_day_usd: '',
  per_asker_day_usd: '',
  per_day_usd: '',
})
function formOf(q: PlanQuotas): Form {
  return {
    per_owner_day: q.per_owner_day,
    per_asker_day: q.per_asker_day,
    per_day: q.per_day,
    per_owner_day_usd: usdField(q.per_owner_day_usd),
    per_asker_day_usd: usdField(q.per_asker_day_usd),
    per_day_usd: usdField(q.per_day_usd),
  }
}
function same(f: Form, q: PlanQuotas): boolean {
  return SCOPES.every(({ key, usd }) => f[key] === q[key] && sameUsd(f[usd], q[usd]))
}
// The plan read again (after a change to an offer, say) shows its quotas, unless some are being changed here.
watch(
  () => props.plan.quotas,
  (q, before) => {
    if (!before || same(form, before)) Object.assign(form, formOf(q))
  },
  { immediate: true },
)

type Field = Answers | Dollars
const fieldErrors = reactive<Partial<Record<Field, string>>>({})
const saving = ref<'save' | 'reset' | null>(null)
const error = shallowRef<unknown>(null)
const unpriced = shallowRef<UnpricedItem[]>([])
const errorProblems = computed(() => problemsOf(error.value))

const defaults = computed(() => props.plan.quota_defaults)
const changed = computed(() => !same(form, props.plan.quotas))

function defaultAnswers(k: Answers): string {
  const v = defaults.value[k]
  return v === null ? t('runtimeAdmin.quotas.defaultNone') : t('runtimeAdmin.quotas.default', { n: v })
}
function defaultUsd(k: Dollars): string {
  const v = defaults.value[k]
  return v == null ? t('runtimeAdmin.quotas.defaultNone') : t('runtimeAdmin.quotas.default', { n: `$${usdShown(v)}` })
}

function clearMessages() {
  error.value = null
  unpriced.value = []
  for (const k of Object.keys(fieldErrors) as Field[]) delete fieldErrors[k]
}

/** A refusal: on its field, or above, with the offers or agents it says have no price. */
function onRefusal(e: unknown) {
  const f = isRuntimeError(e) && ['invalid_field', 'missing_field'].includes(e.reason) ? e.details?.field : null
  const field = (Object.keys(form) as Field[]).find((k) => f === `/${k}`)
  if (field) {
    fieldErrors[field] = t(field.endsWith('_usd') ? 'runtimeAdmin.money.invalidUsd' : 'runtimeAdmin.quotas.invalid')
    return
  }
  error.value = e
  unpriced.value = unpricedItems(unpricedIds(e), props.plan.offers ?? [])
}

async function save() {
  if (saving.value) return
  clearMessages()
  for (const s of SCOPES) {
    const a = quotaProblem(form[s.key], s.required)
    if (a) fieldErrors[s.key] = t(a)
    const u = dollars.value ? usdProblem(form[s.usd]) : null
    if (u) fieldErrors[s.usd] = t(u)
  }
  if (Object.keys(fieldErrors).length) return
  const body: QuotasPut = {
    per_owner_day: form.per_owner_day!,
    per_asker_day: form.per_asker_day!,
    per_day: form.per_day ?? null,
  }
  if (dollars.value) {
    body.per_owner_day_usd = usdSent(form.per_owner_day_usd)
    body.per_asker_day_usd = usdSent(form.per_asker_day_usd)
    body.per_day_usd = usdSent(form.per_day_usd)
  }
  saving.value = 'save'
  try {
    const r = await runtimeAdmin.setQuotas(body)
    emit('update', r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.quotas.saved') })
  } catch (e) {
    onRefusal(e)
  } finally {
    saving.value = null
  }
}

async function reset() {
  if (saving.value) return
  const d = defaults.value
  const usd = (v: string | null | undefined) => (v == null ? t('runtimeAdmin.quotas.noCeiling') : `$${usdShown(v)}`)
  const body =
    t('runtimeAdmin.quotas.resetBody', {
      owner: d.per_owner_day,
      asker: d.per_asker_day,
      day: d.per_day ?? t('runtimeAdmin.quotas.noCeiling'),
    }) +
    (dollars.value
      ? ` ${t('runtimeAdmin.quotas.resetBodyUsd', { owner: usd(d.per_owner_day_usd), asker: usd(d.per_asker_day_usd), day: usd(d.per_day_usd) })}`
      : '')
  const ok = await ElMessageBox.confirm(body, t('runtimeAdmin.quotas.resetTitle'), {
    type: 'warning',
    confirmButtonText: t('runtimeAdmin.quotas.reset'),
    cancelButtonText: t('common.actions.cancel'),
  }).then(
    () => true,
    () => false,
  )
  if (!ok) return
  saving.value = 'reset'
  clearMessages()
  try {
    const r = await runtimeAdmin.resetQuotas()
    Object.assign(form, formOf(r.data.quotas))
    emit('update', r.data)
    ElMessage({ type: 'success', message: t('runtimeAdmin.quotas.restored') })
  } catch (e) {
    onRefusal(e)
  } finally {
    saving.value = null
  }
}

function undo() {
  Object.assign(form, formOf(props.plan.quotas))
  clearMessages()
}
</script>

<template>
  <section class="app-card quotas-card">
    <h2 class="app-card__title">{{ t('runtimeAdmin.quotas.title') }}</h2>
    <i18n-t
      :keypath="dollars ? 'runtimeAdmin.quotas.introUsd' : 'runtimeAdmin.quotas.intro'"
      tag="p"
      scope="global"
      class="quotas-card__intro"
    >
      <template #reset><DailyReset /></template>
    </i18n-t>
    <el-form label-position="top" class="quotas-card__form" :class="{ 'has-dollars': dollars }" @submit.prevent="save">
      <div v-if="dollars" class="quotas-card__heads" aria-hidden="true">
        <span />
        <span>{{ t('runtimeAdmin.money.answersDay') }}</span>
        <span>{{ t('runtimeAdmin.money.usdDay') }}</span>
      </div>
      <div v-for="s in SCOPES" :key="s.key" class="quotas-card__row" :class="`quotas-card__${s.key}`">
        <div class="quotas-card__scope">
          <span :id="`quota-${s.key}`" class="quotas-card__label">{{ t(s.label) }}</span>
          <span class="app-form-hint">{{ t(s.hint) }}</span>
        </div>
        <el-form-item :error="fieldErrors[s.key]" class="quotas-card__field quotas-card__answers">
          <el-input-number
            v-model="form[s.key]"
            :min="1"
            :max="QUOTA_MAX"
            :step="1"
            :precision="0"
            :value-on-clear="null"
            :placeholder="s.required ? String(defaults[s.key] ?? '') : t('runtimeAdmin.quotas.noCeiling')"
            :disabled="!!saving"
            :aria-label="t('runtimeAdmin.money.answersOf', { what: t(s.label) })"
            controls-position="right"
            class="quotas-card__input"
          />
          <div class="app-form-hint quotas-card__default">{{ defaultAnswers(s.key) }}</div>
        </el-form-item>
        <el-form-item v-if="dollars" :error="fieldErrors[s.usd]" class="quotas-card__field quotas-card__usd">
          <el-input
            v-model="form[s.usd]"
            inputmode="decimal"
            :placeholder="t('runtimeAdmin.money.noLimit')"
            :disabled="!!saving"
            :aria-label="t('runtimeAdmin.money.usdOf', { what: t(s.label) })"
            class="quotas-card__input"
          >
            <template #prepend>$</template>
          </el-input>
          <div class="app-form-hint quotas-card__default">{{ defaultUsd(s.usd) }}</div>
        </el-form-item>
      </div>
    </el-form>

    <p class="quotas-card__source">
      <template v-if="plan.quotas_set">
        <span>{{ t('runtimeAdmin.quotas.set') }}</span>
        <ChangedBy :by="plan.quotas_updated_by" :at="plan.quotas_updated_at" class="app-muted" />
      </template>
      <span v-else>{{ t('runtimeAdmin.quotas.defaults') }}</span>
    </p>
    <p v-if="dollars" class="app-form-hint quotas-card__dollars">{{ t('runtimeAdmin.quotas.usdNeedsPrices') }}</p>
    <p v-else class="app-form-hint quotas-card__dollars">{{ t('runtimeAdmin.quotas.dollars') }}</p>

    <UnpricedNotice
      v-if="unpriced.length"
      :items="unpriced"
      :title="t('runtimeAdmin.quotas.unpricedTitle')"
      :providers="providers"
      class="quotas-card__unpriced"
    />
    <el-alert
      v-else-if="error"
      type="error"
      show-icon
      :title="adminErrorText(error, t)"
      class="quotas-card__error"
      @close="error = null"
    >
      <ul v-if="errorProblems.length" class="quotas-card__problems">
        <li v-for="(p, i) in errorProblems" :key="i">{{ p }}</li>
      </ul>
      <router-link
        v-if="errorProblems.length"
        :to="{ name: 'admin-runtime', query: { tab: 'pricing' } }"
        class="quotas-card__to-prices"
        >{{ t('runtimeAdmin.costs.toPrices') }}</router-link
      >
    </el-alert>

    <div class="quotas-card__actions">
      <el-button
        type="primary"
        :loading="saving === 'save'"
        :disabled="!changed || (!!saving && saving !== 'save')"
        class="quotas-card__save"
        @click="save"
      >
        {{ t('common.actions.save') }}
      </el-button>
      <el-button v-if="changed" :disabled="!!saving" class="quotas-card__undo" @click="undo">
        {{ t('common.actions.cancel') }}
      </el-button>
      <el-button
        v-if="plan.quotas_set"
        :loading="saving === 'reset'"
        :disabled="!!saving && saving !== 'reset'"
        class="quotas-card__reset"
        @click="reset"
      >
        {{ t('runtimeAdmin.quotas.reset') }}
      </el-button>
    </div>
  </section>
</template>

<style scoped>
/* The fields follow the card's own width: beside their scope while there is room, and stacked below it. */
.quotas-card {
  container-type: inline-size;
}
.quotas-card__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.quotas-card__heads,
.quotas-card__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 16px;
  align-items: start;
}
.has-dollars .quotas-card__heads,
.has-dollars .quotas-card__row {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
}
.quotas-card__heads {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
}
.quotas-card__scope {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 4px;
  margin-bottom: 8px;
}
.quotas-card__label {
  font-weight: 600;
}
.quotas-card__input {
  width: 100%;
}
.quotas-card__default {
  width: 100%;
}
.quotas-card__source {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 0 0 4px;
  font-size: 13px;
}
.quotas-card__dollars {
  margin: 0 0 16px;
}
.quotas-card__unpriced,
.quotas-card__error {
  margin-bottom: 12px;
}
.quotas-card__problems {
  margin: 4px 0;
  padding-left: 18px;
  word-break: break-word;
}
.quotas-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.quotas-card__actions .el-button + .el-button {
  margin-left: 0;
}
@container (max-width: 599px) {
  .quotas-card__heads {
    display: none;
  }
  .quotas-card__row,
  .has-dollars .quotas-card__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
