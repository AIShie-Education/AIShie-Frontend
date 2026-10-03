<script setup lang="ts">
// Adding a price to the table, or editing one of the site's (POST and PATCH
// admin/prices): a provider's model, exactly or as a pattern with *, from a
// day on, in dollars per million tokens of input, output and the cache's
// reads and writes (the input's price where left empty). Its ID names it in
// the ledger's versions, so it never changes: one is suggested from the
// model and the day. A price applies to calls from now on; costs recorded
// keep the price they had.
//
// An edit sends only what changed from the row as read, at its version
// (If-Match): one changed meanwhile (412) is read again, what was changed
// here kept over it, and the administrator told.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { isRuntimeError, isVersionMismatch, runtimeAdmin } from '@/api/runtime'
import type { PriceRow, ProviderOffer } from '@/api/runtime-types'
import { problemsOf } from '@/views/account/components/agents/hosting'
import {
  adminErrorText,
  emptyPriceForm,
  priceCreateFrom,
  priceFieldOf,
  priceFormOf,
  priceIdFor,
  pricePatchFrom,
  priceProblems,
  type PriceField,
  type PriceForm,
} from './runtimeAdmin'
import TimeText from '@/components/TimeText.vue'
import { USD_SIGN } from '@/utils/format'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    /** The site's row to edit, or null to add one. */
    row?: PriceRow | null
    /** What a new row starts with: an unpriced offer's provider and model, say. */
    prefill?: Partial<PriceForm> | null
    /** The providers the runtime takes keys for, to choose from; another may be typed. */
    providers?: ProviderOffer[] | null
    /** The ids the table has already. */
    takenIds?: readonly string[]
  }>(),
  { row: null, prefill: null, providers: null, takenIds: () => [] },
)
const emit = defineEmits<{
  saved: [row: PriceRow]
  /** The table should be read again: the row changed or went meanwhile. */
  changed: []
}>()
const { t } = useI18n()
/** When the day chosen starts: the runtime's days are UTC days. */
const dayStart = computed(() => (/^\d{4}-\d\d-\d\d$/.test(form.from) ? `${form.from}T00:00:00Z` : null))

const creating = computed(() => !props.row)
const base = shallowRef<PriceRow | null>(null)
const form = reactive<PriceForm>(emptyPriceForm())
/** The ID follows the model and day until it is typed. */
const idTyped = ref(false)
const saving = ref(false)
const error = shallowRef<unknown>(null)
const fieldErrors = reactive<Partial<Record<PriceField, string>>>({})
const notice = ref('')

const PRICES = [
  { key: 'input', label: 'runtimeAdmin.prices.input', required: true },
  { key: 'output', label: 'runtimeAdmin.prices.output', required: true },
  { key: 'cacheRead', label: 'runtimeAdmin.prices.cacheRead', required: false },
  { key: 'cacheWrite', label: 'runtimeAdmin.prices.cacheWrite', required: false },
] as const

function resetMessages() {
  error.value = null
  notice.value = ''
  for (const k of Object.keys(fieldErrors) as PriceField[]) delete fieldErrors[k]
}

function start() {
  resetMessages()
  base.value = props.row
  Object.assign(form, props.row ? priceFormOf(props.row) : { ...emptyPriceForm(), ...(props.prefill ?? {}) })
  idTyped.value = !!props.row || !!props.prefill?.id
  if (!idTyped.value) form.id = form.model ? priceIdFor(form.model, form.from) : ''
}
watch(
  open,
  (v) => {
    if (v) start()
  },
  { immediate: true },
)
watch(
  () => [form.model, form.from],
  () => {
    if (creating.value && !idTyped.value) form.id = form.model.trim() ? priceIdFor(form.model.trim(), form.from) : ''
  },
)
for (const k of ['id', 'provider', 'model', 'from', 'input', 'output', 'cacheRead', 'cacheWrite'] as const) {
  watch(
    () => form[k],
    () => delete fieldErrors[k],
  )
}

function onId(v: string) {
  form.id = v
  idTyped.value = true
}

/** Refusals said on a field of the dialog. */
const FIELD_REASONS: ReadonlySet<string> = new Set(['missing_field', 'invalid_field', 'price_exists'])

function showError(e: unknown) {
  if (isRuntimeError(e) && FIELD_REASONS.has(e.reason)) {
    const f = priceFieldOf(e.details?.field)
    if (f && (f !== 'id' || creating.value)) {
      fieldErrors[f] =
        e.reason === 'missing_field'
          ? t('hosting.model.invalid.required')
          : e.reason === 'invalid_field'
            ? t('hosting.errors.invalid_field')
            : adminErrorText(e, t)
      return
    }
  }
  error.value = e
}
const errorProblems = computed(() => problemsOf(error.value))

/** Reads the row again after a 412, and keeps what was changed here over it. */
async function rebase() {
  const b = base.value
  if (!b) return
  const fresh = (await runtimeAdmin.price(b.id)).data
  const was = priceFormOf(b)
  const now = priceFormOf(fresh)
  for (const k of Object.keys(form) as PriceField[]) if (form[k] === was[k]) form[k] = now[k]
  base.value = fresh
}

/** The row went meanwhile: said, the dialog closed, the table read again. */
function onGone(e: unknown): boolean {
  if (!isRuntimeError(e) || e.reason !== 'price_not_found' || creating.value) return false
  ElMessage({ type: 'info', message: t('runtimeAdmin.errors.price_not_found') })
  open.value = false
  emit('changed')
  return true
}

async function save() {
  if (saving.value) return
  resetMessages()
  const problems = priceProblems(form, { creating: creating.value, takenIds: props.takenIds })
  for (const [f, k] of Object.entries(problems)) fieldErrors[f as PriceField] = t(k as string)
  if (Object.keys(problems).length) return
  saving.value = true
  try {
    let row: PriceRow
    if (creating.value) {
      row = (await runtimeAdmin.createPrice(priceCreateFrom(form))).data
    } else {
      const b = base.value!
      const patch = pricePatchFrom(b, form)
      if (!Object.keys(patch).length) {
        open.value = false
        return
      }
      row = (await runtimeAdmin.updatePrice(b.id, b.row_version ?? 0, patch)).data
    }
    ElMessage({ type: 'success', message: t('runtimeAdmin.prices.saved', { model: row.model, from: row.from }) })
    open.value = false
    emit('saved', row)
  } catch (e) {
    if (isVersionMismatch(e)) {
      try {
        await rebase()
        notice.value = t('runtimeAdmin.prices.changedElsewhere')
      } catch (again) {
        if (!onGone(again)) showError(again)
      }
      return
    }
    if (!onGone(e)) showError(e)
  } finally {
    saving.value = false
  }
}

const title = computed(() =>
  props.row ? t('runtimeAdmin.prices.editTitle', { model: props.row.model }) : t('runtimeAdmin.prices.createTitle'),
)
</script>

<template>
  <el-dialog
    v-model="open"
    :title="title"
    width="560px"
    destroy-on-close
    append-to-body
    :close-on-click-modal="!saving"
    class="price-dialog"
  >
    <el-alert
      v-if="notice"
      type="warning"
      :closable="false"
      show-icon
      :title="notice"
      class="price-dialog__alert price-dialog__notice"
    />
    <el-form label-position="top" class="price-form" @submit.prevent>
      <el-form-item :label="t('runtimeAdmin.prices.provider')" :error="fieldErrors.provider">
        <el-select
          v-model="form.provider"
          filterable
          allow-create
          default-first-option
          :placeholder="t('runtimeAdmin.prices.providerPlaceholder')"
          class="price-form__provider"
        >
          <el-option
            v-for="p in providers ?? []"
            :key="p.provider"
            :value="p.provider"
            :label="t('common.aside', { text: p.label, aside: p.provider })"
          />
        </el-select>
        <div class="app-form-hint">{{ t('runtimeAdmin.prices.providerHint') }}</div>
      </el-form-item>
      <el-form-item :label="t('runtimeAdmin.prices.model')" :error="fieldErrors.model">
        <el-input v-model="form.model" maxlength="200" spellcheck="false" class="price-form__model" />
        <div class="app-form-hint">{{ t('runtimeAdmin.prices.modelHint') }}</div>
      </el-form-item>
      <el-form-item :label="t('runtimeAdmin.prices.from')" :error="fieldErrors.from">
        <el-date-picker
          v-model="form.from"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY-MM-DD"
          :clearable="false"
          class="price-form__from"
        />
        <!-- The runtime's days are UTC days, and the hint says so: when the day chosen begins in UTC, on
             the reader's clock (not when their own day begins, east or west of UTC), the UTC on hover. -->
        <i18n-t
          keypath="runtimeAdmin.prices.fromHint"
          tag="div"
          scope="global"
          class="app-form-hint price-form__from-hint"
        >
          <template #start><TimeText :value="dayStart" cutoff /></template>
        </i18n-t>
      </el-form-item>

      <h3 class="price-form__section">{{ t('runtimeAdmin.prices.perMTok') }}</h3>
      <div class="price-form__prices">
        <el-form-item
          v-for="p in PRICES"
          :key="p.key"
          :label="t(p.label)"
          :error="fieldErrors[p.key]"
          :class="`price-form__price price-form__${p.key}`"
        >
          <el-input
            v-model="form[p.key]"
            inputmode="decimal"
            :placeholder="p.required ? '' : t('runtimeAdmin.prices.sameAsInput')"
          >
            <template #prepend>{{ USD_SIGN }}</template>
          </el-input>
        </el-form-item>
      </div>

      <el-form-item v-if="creating" :label="t('runtimeAdmin.prices.id')" :error="fieldErrors.id">
        <el-input
          :model-value="form.id"
          maxlength="64"
          spellcheck="false"
          class="price-form__id"
          @update:model-value="onId"
        />
        <div class="app-form-hint">{{ t('runtimeAdmin.prices.idHint') }}</div>
      </el-form-item>
      <el-form-item v-else :label="t('runtimeAdmin.prices.id')">
        <code class="price-form__id-fixed">{{ row?.id }}</code>
      </el-form-item>
      <el-alert type="info" :closable="false" show-icon :title="t('runtimeAdmin.prices.fromNowOn')" />
    </el-form>
    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      show-icon
      :title="adminErrorText(error, t)"
      class="price-dialog__alert price-dialog__error"
    >
      <ul v-if="errorProblems.length" class="price-dialog__problems">
        <li v-for="(p, i) in errorProblems" :key="i">{{ p }}</li>
      </ul>
    </el-alert>

    <template #footer>
      <el-button :disabled="saving" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" class="price-dialog__save" :loading="saving" @click="save">
        {{ creating ? t('common.actions.add') : t('common.actions.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.price-dialog__alert {
  margin-top: 12px;
}
.price-dialog__notice {
  margin: 0 0 12px;
}
.price-form :deep(.el-select),
.price-form :deep(.el-date-editor.el-input) {
  width: 100%;
}
.price-form__section {
  margin: 4px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.price-form__prices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.price-form__id-fixed {
  font-size: 13px;
}
.price-dialog__problems {
  margin: 4px 0 0;
  padding-left: 18px;
  word-break: break-word;
}
@media (max-width: 480px) {
  .price-form__prices {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
