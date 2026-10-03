<script setup lang="ts">
// OpenRouter's upstream routing, in the offer's dialog for an offer of
// OpenRouter's: which of the upstream providers serving the model may answer
// (all but those turned off, or only those turned on), which are tried
// first, and on what terms (data, precision, highest prices, speed). The
// routing is the dialog's (a RoutingForm, changed here in place), sent as
// its canonical object, which the preview shows as OpenRouter is sent it.
//
// The upstream providers are listed for the model as typed
// (runtimeAdmin.openRouterEndpoints): asked once it reads as author/slug,
// 600 ms after the typing stops, the request before aborted. A slug may be
// added by hand whatever the list says, and the slugs the routing names that
// OpenRouter does not list now are rows of their own. What may answer, and
// whether those call tools, is worked out from the list (openRouter.ts);
// nothing is said of data, which the list does not tell.
//
// Refusals of the routing (errors, by where they are said) are the
// dialog's, set on a save; each goes as its control changes.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, Close, Loading } from '@element-plus/icons-vue'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import JsonView from '@/components/JsonView.vue'
import TimeText from '@/components/TimeText.vue'
import { isRuntimeError, runtimeAdmin } from '@/api/runtime'
import type { OpenRouterEndpoints, OpenRouterSortBy, ProviderOffer } from '@/api/runtime-types'
import { OPENROUTER_SORTS } from '@/api/runtime-types'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { USD_SIGN, formatCount, formatList, formatMoney, formatPct, regionName } from '@/utils/format'
import { joinParts } from '@/utils/parts'
import {
  ENDPOINTS_DEBOUNCE_MS,
  MODEL_ID,
  OPENROUTER,
  PERCENTILES,
  PRICE_KEYS,
  QUANTIZATION_OPTIONS,
  candidates,
  highestPrices,
  moveInOrder,
  routingFromForm,
  routingRows,
  routingWarnings,
  setMode,
  setSort,
  setUsed,
  slugProblem,
  tableBelow,
  tryFirst,
  unorder,
  unskip,
  type Exclusion,
  type Percentile,
  type PriceKey,
  type RoutingForm,
  type RoutingMode,
  type RoutingRow,
} from './openRouter'
import { adminErrorText, isNotOffered, usdField, type PriceForm } from './runtimeAdmin'
import PriceDialog from './PriceDialog.vue'

const props = defineProps<{
  /** The dialog's routing, changed here in place. */
  routing: RoutingForm
  /** The model as typed in the dialog. */
  model: string
  /** The offer's bound on an answer's length; null for the runtime's own. */
  maxOutputTokens: number | null
  /** What the runtime or the form found wrong, by where it is said (openRouter.ts, RoutingErrorKey). */
  errors: Record<string, string>
  /** For the price dialog. */
  providers?: ProviderOffer[] | null
}>()
const { t } = useI18n()

// A phone's layout, a card per upstream provider, where the window is narrower than the table's 640 px.
const phone = useMediaQuery('(max-width: 639px)')

// --- The upstream providers OpenRouter lists ------------------------------------------------------
type ListState = 'needModel' | 'loading' | 'ready' | 'failed'
const listState = ref<ListState>('needModel')
const answer = shallowRef<OpenRouterEndpoints | null>(null)
const listError = shallowRef<unknown>(null)
/** The model the list is, or is being, read for. */
const asked = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let pending: AbortController | null = null
const modelId = computed(() => props.model.trim())

function stop() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
  pending?.abort()
  pending = null
}

/** Reads the list for the model as it is now, after wait ms (none: at once); the request before is aborted. */
function schedule(wait: number) {
  stop()
  const m = modelId.value
  asked.value = m
  answer.value = null
  listError.value = null
  if (!MODEL_ID.test(m)) {
    listState.value = 'needModel'
    return
  }
  listState.value = 'loading'
  if (wait > 0) timer = setTimeout(() => void load(m), wait)
  else void load(m)
}

async function load(m: string) {
  timer = undefined
  const mine = new AbortController()
  pending = mine
  try {
    const r = await runtimeAdmin.openRouterEndpoints(m, mine.signal)
    if (pending !== mine) return
    answer.value = r.data
    listState.value = 'ready'
  } catch (e) {
    if (pending !== mine) return
    listError.value = e
    listState.value = 'failed'
  } finally {
    if (pending === mine) pending = null
  }
}
const retry = () => schedule(0)

watch(modelId, () => schedule(ENDPOINTS_DEBOUNCE_MS))
onMounted(() => schedule(0))
onBeforeUnmount(stop)

/** Why the list could not be read: OpenRouter could not be reached, has no such model, a runtime from before the route, or else. */
const failure = computed(() => {
  const e = listError.value
  if (!e) return null
  if (isRuntimeError(e) && e.reason === 'openrouter_unavailable') return 'unavailable'
  if (isRuntimeError(e) && e.reason === 'openrouter_model_not_found') return 'modelNotFound'
  if (isNotOffered(e)) return 'notOffered'
  return 'other'
})

// --- The table ------------------------------------------------------------------------------------
const endpoints = computed(() => answer.value?.endpoints ?? [])
const rows = computed(() => routingRows(answer.value ? endpoints.value : null, props.routing, props.maxOutputTokens))
const all = computed(() => candidates(endpoints.value, props.routing, props.maxOutputTokens))
const warnings = computed(() => routingWarnings(endpoints.value, props.routing, props.maxOutputTokens))
const highest = computed(() => highestPrices(all.value))
const low = computed(() => tableBelow(answer.value?.price ?? null, highest.value))

const name = (row: RoutingRow) => row.endpoint?.provider_name ?? row.slug
const excluded = (row: RoutingRow) => !!row.candidate && row.used && !row.candidate.allowed

/** The words of the control that leaves out an upstream provider turned on. */
const EXCLUSION_LABEL: Record<Exclusion, string> = {
  quantizations: 'runtimeAdmin.openrouter.quantizations',
  zdr: 'runtimeAdmin.openrouter.zdr',
  maxPrice: 'runtimeAdmin.openrouter.maxPrice',
  maxOutput: 'hosting.model.maxOutputTokens',
}
function reason(row: RoutingRow): string {
  if (!excluded(row)) return ''
  return t('runtimeAdmin.openrouter.excludedBy', {
    controls: formatList(row.candidate!.excludedBy.map((x) => t(EXCLUSION_LABEL[x]))),
  })
}
function links(row: RoutingRow): { url: string; label: string }[] {
  const e = row.endpoint
  if (!e) return []
  const out: { url: string; label: string }[] = []
  if (e.privacy_policy_url) out.push({ url: e.privacy_policy_url, label: 'runtimeAdmin.openrouter.privacy' })
  if (e.terms_of_service_url) out.push({ url: e.terms_of_service_url, label: 'runtimeAdmin.openrouter.terms' })
  if (e.status_page_url) out.push({ url: e.status_page_url, label: 'runtimeAdmin.openrouter.statusPage' })
  return out
}
/** Its precision, context, longest answer and home: the line under its name. */
function facts(row: RoutingRow): string {
  const e = row.endpoint
  if (!e) return ''
  return joinParts([
    e.quantization && e.quantization !== 'unknown' ? e.quantization.toUpperCase() : null,
    t('runtimeAdmin.openrouter.context', { n: formatCount(e.context_length) }),
    e.max_output_tokens !== null
      ? t('runtimeAdmin.openrouter.maxOutput', { n: formatCount(e.max_output_tokens) })
      : null,
    e.headquarters ? t('runtimeAdmin.openrouter.based', { country: regionName(e.headquarters) }) : null,
  ])
}
function price(row: RoutingRow): string {
  const e = row.endpoint
  if (!e) return ''
  return t('runtimeAdmin.openrouter.pricePair', {
    input: formatMoney(e.usd_per_mtok.input, { exact: true }),
    output: formatMoney(e.usd_per_mtok.output, { exact: true }),
  })
}
/** What changes its price: a discount, a dearer long context. */
function priceNotes(row: RoutingRow): string[] {
  const e = row.endpoint
  if (!e) return []
  const out: string[] = []
  if (e.discount > 0) out.push(t('runtimeAdmin.openrouter.discount', { pct: formatPct(e.discount) }))
  if (e.higher_above_tokens !== null)
    out.push(t('runtimeAdmin.openrouter.higherAbove', { n: formatCount(e.higher_above_tokens) }))
  return out
}
const tools = (row: RoutingRow) =>
  row.endpoint ? t(row.endpoint.tools ? 'runtimeAdmin.openrouter.yes' : 'runtimeAdmin.openrouter.no') : ''
function uptime(row: RoutingRow): string {
  const e = row.endpoint
  if (!e) return ''
  const pct = (u: number | null) => (u === null ? '—' : formatPct(u / 100))
  return t('runtimeAdmin.openrouter.uptimePair', { m30: pct(e.uptime_30m), d1: pct(e.uptime_1d) })
}
const rowClass = ({ row }: { row: RoutingRow }) => (excluded(row) ? 'or-row is-excluded' : 'or-row')

function onUse(row: RoutingRow, on: string | number | boolean) {
  setUsed(props.routing, row.slug, on === true)
}
function onMode(mode: string | number | boolean | undefined) {
  setMode(props.routing, mode as RoutingMode)
}

// --- Adding by slug -----------------------------------------------------------------------------------------
const slugInput = ref('')
const slugError = ref('')
function onSlugInput(v: string) {
  slugInput.value = v.toLowerCase()
  slugError.value = ''
}
/** Adds the slug typed as a row: turned on, where only those turned on may answer. */
function addSlug() {
  const s = slugInput.value.trim()
  const problem = slugProblem(
    s,
    rows.value.map((r) => r.slug),
  )
  if (problem) {
    slugError.value = t(problem)
    return
  }
  props.routing.added = [...props.routing.added, s]
  if (props.routing.mode === 'only') setUsed(props.routing, s, true)
  slugInput.value = ''
}

// --- The other controls --------------------------------------------------------------------------------------
const SPEED: { member: 'preferred_min_throughput' | 'preferred_max_latency'; field: 'throughput' | 'latency' }[] = [
  { member: 'preferred_min_throughput', field: 'throughput' },
  { member: 'preferred_max_latency', field: 'latency' },
]
const PRICE_LABELS: Record<PriceKey, string> = {
  prompt: 'runtimeAdmin.openrouter.maxPrompt',
  completion: 'runtimeAdmin.openrouter.maxCompletion',
  request: 'runtimeAdmin.openrouter.maxRequest',
  image: 'runtimeAdmin.openrouter.maxImage',
}
const quantLabel = (q: string) => (q === 'unknown' ? t('runtimeAdmin.openrouter.quant.unknown') : q.toUpperCase())
/** OpenRouter's own balance, which sets no sort, is an option of its own: an empty value would read as nothing chosen. */
const SORT_DEFAULT = 'default'
const sortOptions = computed(() => [
  { value: SORT_DEFAULT, label: t('runtimeAdmin.openrouter.sortBy.default') },
  ...OPENROUTER_SORTS.map((s) => ({ value: s, label: t(`runtimeAdmin.openrouter.sortBy.${s}`) })),
])
function onSort(v: string) {
  setSort(props.routing, v === SORT_DEFAULT ? '' : (v as OpenRouterSortBy))
}

/** What OpenRouter is sent with each call, as it is sent. */
const canonical = computed(() => routingFromForm(props.routing))
const preview = ref<string[]>([])

// --- Prices ------------------------------------------------------------------------------------------------------------
const priceOpen = ref(false)
const pricePrefill = computed<Partial<PriceForm>>(() => ({
  provider: OPENROUTER,
  model: modelId.value,
  input: usdField(highest.value?.input),
  output: usdField(highest.value?.output),
  cacheRead: usdField(highest.value?.cache_read),
}))

// --- What was found wrong goes as its control changes ----------------------------------------------------------------------
function clear(...keys: string[]) {
  for (const key of keys) delete props.errors[key]
}
watch(
  () => [props.routing.order, props.routing.only, props.routing.ignore, props.routing.mode],
  () => clear('table', 'section'),
)
watch(
  () => props.routing.dataCollection,
  () => clear('data_collection'),
)
watch(
  () => props.routing.zdr,
  () => clear('zdr'),
)
watch(
  () => props.routing.allowFallbacks,
  () => clear('allow_fallbacks'),
)
watch(
  () => props.routing.requireParameters,
  () => clear('require_parameters'),
)
watch(
  () => [props.routing.sortBy, props.routing.sortPartition],
  () => clear('sort'),
)
watch(
  () => props.routing.quantizations,
  () => clear('quantizations'),
)
for (const s of SPEED) {
  for (const p of PERCENTILES) {
    watch(
      () => props.routing[s.field][p],
      () => clear(`${s.member}/${p}`, s.member),
    )
  }
}
for (const key of PRICE_KEYS) {
  watch(
    () => props.routing.maxPrice[key],
    () => clear(`max_price/${key}`, 'max_price'),
  )
}
const pctLabel = (p: Percentile) => t(`runtimeAdmin.openrouter.pct.${p}`)
</script>

<template>
  <div class="or-routing">
    <AppNote class="or-routing__intro">{{ t('runtimeAdmin.openrouter.intro') }}</AppNote>
    <el-alert
      v-if="errors.section"
      type="error"
      :closable="false"
      show-icon
      :title="errors.section"
      class="or-routing__alert or-routing__error"
    />

    <!-- Data -->
    <h4 class="or-routing__sub">{{ t('runtimeAdmin.openrouter.data') }}</h4>
    <div class="or-switch">
      <el-switch
        id="or-deny-data"
        :model-value="routing.dataCollection === 'deny'"
        class="or-deny-data"
        @update:model-value="routing.dataCollection = $event === true ? 'deny' : null"
      />
      <div>
        <label for="or-deny-data" class="or-switch__label">{{ t('runtimeAdmin.openrouter.denyData') }}</label>
        <p class="app-form-hint">{{ t('runtimeAdmin.openrouter.denyDataHint') }}</p>
        <p v-if="errors.data_collection" class="or-routing__field-error">{{ errors.data_collection }}</p>
      </div>
    </div>
    <div class="or-switch">
      <el-switch
        id="or-zdr"
        :model-value="routing.zdr === true"
        class="or-zdr"
        @update:model-value="routing.zdr = $event === true ? true : null"
      />
      <div>
        <label for="or-zdr" class="or-switch__label">{{ t('runtimeAdmin.openrouter.zdr') }}</label>
        <p class="app-form-hint">{{ t('runtimeAdmin.openrouter.zdrHint') }}</p>
        <p v-if="errors.zdr" class="or-routing__field-error">{{ errors.zdr }}</p>
      </div>
    </div>

    <!-- Upstream providers -->
    <h4 class="or-routing__sub">{{ t('runtimeAdmin.openrouter.upstreams') }}</h4>
    <el-form-item :label="t('runtimeAdmin.openrouter.mode')" class="or-routing__mode">
      <el-radio-group :model-value="routing.mode" class="or-mode" @update:model-value="onMode">
        <el-radio-button value="all">{{ t('runtimeAdmin.openrouter.modeAll') }}</el-radio-button>
        <el-radio-button value="only">{{ t('runtimeAdmin.openrouter.modeOnly') }}</el-radio-button>
      </el-radio-group>
      <div v-if="routing.mode === 'only'" class="app-form-hint or-mode__hint">
        {{ t('runtimeAdmin.openrouter.modeOnlyHint') }}
      </div>
    </el-form-item>

    <p v-if="listState === 'needModel'" class="or-state or-state--need">{{ t('runtimeAdmin.openrouter.needModel') }}</p>
    <p v-else-if="listState === 'loading'" class="or-state or-state--loading">
      <el-icon class="is-loading" aria-hidden="true"><Loading /></el-icon>
      <span>{{ t('runtimeAdmin.openrouter.loading', { model: asked }) }}</span>
    </p>
    <template v-else-if="listState === 'failed'">
      <el-alert
        v-if="failure === 'unavailable'"
        type="error"
        :closable="false"
        show-icon
        :title="t('runtimeAdmin.openrouter.unavailable')"
        class="or-routing__alert or-state--unavailable"
      >
        <el-button size="small" class="or-retry" @click="retry">{{ t('common.actions.retry') }}</el-button>
      </el-alert>
      <el-alert
        v-else-if="failure === 'modelNotFound'"
        type="warning"
        :closable="false"
        show-icon
        :title="t('runtimeAdmin.openrouter.modelNotFound', { model: asked })"
        class="or-routing__alert or-state--not-found"
      />
      <AppNote v-else-if="failure === 'notOffered'" class="or-routing__alert or-state--not-offered">
        {{ t('runtimeAdmin.openrouter.notOffered') }}
      </AppNote>
      <el-alert
        v-else
        type="error"
        :closable="false"
        show-icon
        :title="adminErrorText(listError, t)"
        class="or-routing__alert or-state--failed"
      >
        <el-button size="small" class="or-retry" @click="retry">{{ t('common.actions.retry') }}</el-button>
      </el-alert>
    </template>
    <p v-else-if="answer && !answer.endpoints.length" class="or-state or-state--none">
      {{ t('runtimeAdmin.openrouter.none', { model: asked }) }}
    </p>

    <!-- Not while the list is read: a slug the routing names would show as not listed until it comes. -->
    <template v-if="rows.length && listState !== 'loading'">
      <!-- A card per upstream provider on a phone. -->
      <ul v-if="phone" class="or-cards">
        <li
          v-for="row in rows"
          :key="row.slug"
          class="or-card"
          :class="{ 'is-excluded': excluded(row) }"
          :data-slug="row.slug"
        >
          <div class="or-name">
            <el-tooltip :disabled="!reason(row) && !links(row).length" placement="top" popper-class="app-tip-wrap">
              <template #content>
                <span v-if="reason(row)" class="or-tip__line">{{ reason(row) }}</span>
                <a
                  v-for="l in links(row)"
                  :key="l.url"
                  :href="l.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="or-tip__link"
                  >{{ t(l.label) }}</a
                >
              </template>
              <strong class="or-name__provider" :tabindex="reason(row) || links(row).length ? 0 : undefined">{{
                name(row)
              }}</strong>
            </el-tooltip>
            <code class="or-name__slug"
              ><template v-for="(part, i) in row.slug.split('/')" :key="i"
                ><template v-if="i">/<wbr /></template>{{ part }}</template
              ></code
            >
            <AppTag v-if="!row.endpoint && answer" tone="wait" class="or-name__tag or-not-listed">{{
              t('runtimeAdmin.openrouter.notListed')
            }}</AppTag>
            <AppTag v-if="row.endpoint?.zdr === true" variant="outline" class="or-name__tag or-zdr-tag">{{
              t('runtimeAdmin.openrouter.zdrTag')
            }}</AppTag>
            <AppTag v-if="row.endpoint && row.endpoint.status !== 0" tone="wait" class="or-name__tag or-degraded">{{
              t('runtimeAdmin.openrouter.degraded')
            }}</AppTag>
          </div>
          <p v-if="facts(row)" class="or-facts">{{ facts(row) }}</p>
          <p v-if="row.endpoint" class="or-card__figures">
            {{
              joinParts([
                t('common.pair', { label: t('runtimeAdmin.openrouter.colPrice'), value: price(row) }),
                t('common.pair', { label: t('runtimeAdmin.openrouter.colTools'), value: tools(row) }),
                t('common.pair', { label: t('runtimeAdmin.openrouter.colUptime'), value: uptime(row) }),
              ])
            }}
          </p>
          <div class="or-card__controls">
            <span v-if="row.coveredBy" class="or-covered">{{
              t('runtimeAdmin.openrouter.covered', { slug: row.coveredBy })
            }}</span>
            <el-switch
              v-else
              :model-value="row.used"
              :aria-label="t('runtimeAdmin.openrouter.use', { name: name(row), slug: row.slug })"
              class="or-use"
              @update:model-value="onUse(row, $event)"
            />
            <span v-if="row.position" class="or-order">
              <span class="or-order__position">{{ t('runtimeAdmin.openrouter.position', { n: row.position }) }}</span>
              <el-button
                link
                :icon="ArrowUp"
                :disabled="row.position === 1"
                :aria-label="t('runtimeAdmin.openrouter.moveUp')"
                class="or-order__up"
                @click="moveInOrder(routing, row.slug, -1)"
              />
              <el-button
                link
                :icon="ArrowDown"
                :disabled="row.position === routing.order.length"
                :aria-label="t('runtimeAdmin.openrouter.moveDown')"
                class="or-order__down"
                @click="moveInOrder(routing, row.slug, 1)"
              />
              <el-button
                link
                :icon="Close"
                :aria-label="t('runtimeAdmin.openrouter.unorder')"
                class="or-order__remove"
                @click="unorder(routing, row.slug)"
              />
            </span>
            <el-button
              v-else-if="row.used"
              link
              type="primary"
              class="or-try-first"
              @click="tryFirst(routing, row.slug)"
              >{{ t('runtimeAdmin.openrouter.tryFirst') }}</el-button
            >
          </div>
        </li>
      </ul>

      <el-table v-else :data="rows" row-key="slug" :row-class-name="rowClass" class="or-table">
        <el-table-column :label="t('runtimeAdmin.openrouter.colProvider')" min-width="190">
          <template #default="{ row }">
            <div class="or-name" :data-slug="row.slug">
              <el-tooltip :disabled="!reason(row) && !links(row).length" placement="top" popper-class="app-tip-wrap">
                <template #content>
                  <span v-if="reason(row)" class="or-tip__line">{{ reason(row) }}</span>
                  <a
                    v-for="l in links(row)"
                    :key="l.url"
                    :href="l.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="or-tip__link"
                    >{{ t(l.label) }}</a
                  >
                </template>
                <strong class="or-name__provider" :tabindex="reason(row) || links(row).length ? 0 : undefined">{{
                  name(row)
                }}</strong>
              </el-tooltip>
              <code class="or-name__slug"
                ><template v-for="(part, i) in row.slug.split('/')" :key="i"
                  ><template v-if="i">/<wbr /></template>{{ part }}</template
                ></code
              >
              <AppTag v-if="!row.endpoint && answer" tone="wait" class="or-name__tag or-not-listed">{{
                t('runtimeAdmin.openrouter.notListed')
              }}</AppTag>
              <AppTag v-if="row.endpoint?.zdr === true" variant="outline" class="or-name__tag or-zdr-tag">{{
                t('runtimeAdmin.openrouter.zdrTag')
              }}</AppTag>
              <AppTag v-if="row.endpoint && row.endpoint.status !== 0" tone="wait" class="or-name__tag or-degraded">{{
                t('runtimeAdmin.openrouter.degraded')
              }}</AppTag>
            </div>
            <p v-if="facts(row)" class="or-facts">{{ facts(row) }}</p>
          </template>
        </el-table-column>
        <el-table-column :label="t('runtimeAdmin.openrouter.colPrice')" min-width="148" align="right">
          <template #default="{ row }">
            <el-tooltip v-if="priceNotes(row).length" placement="top" popper-class="app-tip-wrap">
              <template #content>
                <span v-for="n in priceNotes(row)" :key="n" class="or-tip__line">{{ n }}</span>
              </template>
              <span class="or-price" tabindex="0">{{ price(row) }}</span>
            </el-tooltip>
            <span v-else class="or-price">{{ price(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('runtimeAdmin.openrouter.colTools')" min-width="70">
          <template #default="{ row }">
            <span class="or-tools">{{ tools(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('runtimeAdmin.openrouter.colUptime')" min-width="108" align="right">
          <template #default="{ row }">
            <span class="or-uptime">{{ uptime(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('runtimeAdmin.openrouter.colUse')" min-width="72">
          <template #default="{ row }">
            <span v-if="row.coveredBy" class="or-covered">{{
              t('runtimeAdmin.openrouter.covered', { slug: row.coveredBy })
            }}</span>
            <el-switch
              v-else
              :model-value="row.used"
              :aria-label="t('runtimeAdmin.openrouter.use', { name: name(row), slug: row.slug })"
              class="or-use"
              @update:model-value="onUse(row, $event)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('runtimeAdmin.openrouter.colOrder')" min-width="124">
          <template #default="{ row }">
            <span v-if="row.position" class="or-order">
              <span class="or-order__position">{{ t('runtimeAdmin.openrouter.position', { n: row.position }) }}</span>
              <el-button
                link
                :icon="ArrowUp"
                :disabled="row.position === 1"
                :aria-label="t('runtimeAdmin.openrouter.moveUp')"
                class="or-order__up"
                @click="moveInOrder(routing, row.slug, -1)"
              />
              <el-button
                link
                :icon="ArrowDown"
                :disabled="row.position === routing.order.length"
                :aria-label="t('runtimeAdmin.openrouter.moveDown')"
                class="or-order__down"
                @click="moveInOrder(routing, row.slug, 1)"
              />
              <el-button
                link
                :icon="Close"
                :aria-label="t('runtimeAdmin.openrouter.unorder')"
                class="or-order__remove"
                @click="unorder(routing, row.slug)"
              />
            </span>
            <el-button
              v-else-if="row.used"
              link
              type="primary"
              class="or-try-first"
              @click="tryFirst(routing, row.slug)"
              >{{ t('runtimeAdmin.openrouter.tryFirst') }}</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </template>
    <p v-if="errors.table" class="or-routing__field-error or-table__error">{{ errors.table }}</p>

    <i18n-t
      v-if="answer && answer.endpoints.length && !answer.stale"
      keypath="runtimeAdmin.openrouter.listed"
      tag="p"
      scope="global"
      class="or-listed"
    >
      <template #time><TimeText :value="answer.fetched_at" /></template>
    </i18n-t>
    <i18n-t
      v-else-if="answer && answer.stale"
      keypath="runtimeAdmin.openrouter.stale"
      tag="p"
      scope="global"
      class="or-listed or-listed--stale"
    >
      <template #time><TimeText :value="answer.fetched_at" /></template>
    </i18n-t>

    <p v-if="routing.mode === 'only' && routing.ignore.length" class="or-skipped">
      <i18n-t keypath="runtimeAdmin.openrouter.alsoSkipped" scope="global">
        <template #slugs>
          <span v-for="s in routing.ignore" :key="s" class="or-skipped__item">
            <code>{{ s }}</code>
            <el-button
              link
              :icon="Close"
              :aria-label="t('common.pair', { label: t('common.actions.remove'), value: s })"
              class="or-skipped__remove"
              @click="unskip(routing, s)"
            />
          </span>
        </template>
      </i18n-t>
    </p>

    <el-form-item :label="t('runtimeAdmin.openrouter.addSlug')" :error="slugError" class="or-add">
      <div class="or-add__row">
        <el-input
          :model-value="slugInput"
          :placeholder="t('runtimeAdmin.openrouter.addSlugPlaceholder')"
          maxlength="128"
          spellcheck="false"
          autocomplete="off"
          class="or-add__input"
          @update:model-value="onSlugInput"
          @keydown.enter.prevent="addSlug"
        />
        <el-button class="or-add__button" :aria-label="t('runtimeAdmin.openrouter.addSlug')" @click="addSlug">{{
          t('runtimeAdmin.openrouter.add')
        }}</el-button>
      </div>
      <div class="app-form-hint">{{ t('runtimeAdmin.openrouter.addSlugHint') }}</div>
    </el-form-item>

    <template v-if="listState === 'ready'">
      <el-alert
        v-if="warnings.none"
        type="warning"
        :closable="false"
        show-icon
        :title="t('runtimeAdmin.openrouter.warnNone')"
        class="or-routing__alert or-warn-none"
      />
      <el-alert
        v-else-if="warnings.noTools"
        type="warning"
        :closable="false"
        show-icon
        :title="t('runtimeAdmin.openrouter.warnNoTools')"
        class="or-routing__alert or-warn-no-tools"
      />
      <AppNote v-if="warnings.someNoTools.length" class="or-routing__alert or-note-no-tools">
        {{ t('runtimeAdmin.openrouter.noteSomeNoTools', { names: formatList(warnings.someNoTools) }) }}
      </AppNote>
    </template>

    <!-- Choosing among them -->
    <h4 class="or-routing__sub">{{ t('runtimeAdmin.openrouter.choosing') }}</h4>
    <div class="or-switch">
      <el-switch
        id="or-fallbacks"
        :model-value="routing.allowFallbacks ?? true"
        class="or-fallbacks"
        @update:model-value="routing.allowFallbacks = $event === true"
      />
      <div>
        <label for="or-fallbacks" class="or-switch__label">{{ t('runtimeAdmin.openrouter.fallbacks') }}</label>
        <p class="app-form-hint">{{ t('runtimeAdmin.openrouter.fallbacksHint') }}</p>
        <p v-if="errors.allow_fallbacks" class="or-routing__field-error">{{ errors.allow_fallbacks }}</p>
      </div>
    </div>
    <div class="or-switch">
      <el-switch
        id="or-require-parameters"
        :model-value="routing.requireParameters ?? false"
        class="or-require-parameters"
        @update:model-value="routing.requireParameters = $event === true"
      />
      <div>
        <label for="or-require-parameters" class="or-switch__label">{{
          t('runtimeAdmin.openrouter.requireParameters')
        }}</label>
        <p class="app-form-hint">{{ t('runtimeAdmin.openrouter.requireParametersHint') }}</p>
        <p v-if="errors.require_parameters" class="or-routing__field-error">{{ errors.require_parameters }}</p>
      </div>
    </div>
    <el-form-item :label="t('runtimeAdmin.openrouter.sort')" :error="errors.sort">
      <el-select
        :model-value="routing.sortBy || SORT_DEFAULT"
        :disabled="routing.order.length > 0"
        class="or-sort"
        @update:model-value="onSort"
      >
        <el-option v-for="o in sortOptions" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
      <div class="app-form-hint or-sort__hint">
        {{ routing.order.length ? t('runtimeAdmin.openrouter.sortWithOrder') : t('runtimeAdmin.openrouter.sortHint') }}
      </div>
    </el-form-item>

    <!-- Preferred speed -->
    <h4 class="or-routing__sub">{{ t('runtimeAdmin.openrouter.speed') }}</h4>
    <p class="app-form-hint or-routing__sub-hint">{{ t('runtimeAdmin.openrouter.speedHint') }}</p>
    <div v-for="s in SPEED" :key="s.member" class="or-speed" :class="`or-speed--${s.field}`">
      <p class="or-speed__label">{{ t(`runtimeAdmin.openrouter.${s.field}`) }}</p>
      <div class="or-grid">
        <el-form-item
          v-for="p in PERCENTILES"
          :key="p"
          :label="pctLabel(p)"
          :error="errors[`${s.member}/${p}`]"
          :class="`or-speed__input or-${s.field}-${p}`"
        >
          <el-input-number
            v-model="routing[s.field][p]"
            :controls="false"
            :value-on-clear="null"
            :aria-label="t('common.pair', { label: t(`runtimeAdmin.openrouter.${s.field}`), value: pctLabel(p) })"
          />
        </el-form-item>
      </div>
      <p v-if="errors[s.member]" class="or-routing__field-error">{{ errors[s.member] }}</p>
    </div>

    <!-- Limits -->
    <h4 class="or-routing__sub">{{ t('runtimeAdmin.openrouter.limits') }}</h4>
    <el-form-item
      :label="t('runtimeAdmin.openrouter.quantizations')"
      :error="errors.quantizations"
      class="or-quantizations"
    >
      <el-checkbox-group v-model="routing.quantizations" class="or-quantizations__group">
        <el-checkbox v-for="q in QUANTIZATION_OPTIONS" :key="q" :value="q" :class="`or-quant-${q}`">{{
          quantLabel(q)
        }}</el-checkbox>
      </el-checkbox-group>
      <div class="app-form-hint">{{ t('runtimeAdmin.openrouter.quantizationsHint') }}</div>
    </el-form-item>
    <p class="or-speed__label">{{ t('runtimeAdmin.openrouter.maxPrice') }}</p>
    <div class="or-grid">
      <el-form-item
        v-for="key in PRICE_KEYS"
        :key="key"
        :label="t(PRICE_LABELS[key])"
        :error="errors[`max_price/${key}`]"
        :class="`or-price-input or-max-${key}`"
      >
        <el-input v-model="routing.maxPrice[key]" inputmode="decimal" spellcheck="false">
          <template #prepend>{{ USD_SIGN }}</template>
        </el-input>
      </el-form-item>
    </div>
    <p v-if="errors.max_price" class="or-routing__field-error">{{ errors.max_price }}</p>
    <p class="app-form-hint or-routing__sub-hint">{{ t('runtimeAdmin.openrouter.maxPriceHint') }}</p>

    <!-- Prices -->
    <h4 class="or-routing__sub">{{ t('runtimeAdmin.openrouter.prices') }}</h4>
    <AppNote class="or-prices__note">{{ t('runtimeAdmin.openrouter.pricesNote') }}</AppNote>
    <template v-if="answer">
      <p v-if="highest && highest.input !== null && highest.output !== null" class="or-prices__line or-highest">
        {{
          t('runtimeAdmin.openrouter.highest', {
            input: formatMoney(highest.input, { exact: true }),
            output: formatMoney(highest.output, { exact: true }),
          })
        }}
      </p>
      <p v-if="answer.price" class="or-prices__line or-table-price">
        {{
          t('runtimeAdmin.openrouter.table', {
            input: formatMoney(answer.price.usd_per_mtok.input, { exact: true }),
            output: formatMoney(answer.price.usd_per_mtok.output, { exact: true }),
          })
        }}
      </p>
      <p v-else class="or-prices__line or-table-none">{{ t('runtimeAdmin.openrouter.tableNone') }}</p>
      <el-alert
        v-if="low"
        type="warning"
        :closable="false"
        show-icon
        :title="t('runtimeAdmin.openrouter.tableLow')"
        class="or-routing__alert or-table-low"
      >
        <el-button size="small" class="or-set-price" @click="priceOpen = true">{{
          t('runtimeAdmin.openrouter.setPrice')
        }}</el-button>
      </el-alert>
    </template>

    <!-- The price is asked again once set: the list's price is the table's today. -->
    <PriceDialog v-model="priceOpen" :prefill="pricePrefill" :providers="providers ?? null" @saved="retry" />

    <!-- What is sent -->
    <el-collapse v-model="preview" class="or-preview">
      <el-collapse-item name="preview" :title="t('runtimeAdmin.openrouter.preview')">
        <JsonView v-if="canonical" :value="{ provider: canonical }" class="or-preview__json" />
        <AppNote v-else class="or-preview__empty">{{ t('runtimeAdmin.openrouter.previewEmpty') }}</AppNote>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.or-routing__alert {
  margin: 8px 0;
}
.or-routing__intro {
  margin-bottom: 4px;
}
.or-routing__sub {
  margin: 16px 0 8px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
  color: var(--app-ink-2);
}
.or-routing__sub-hint {
  margin: -4px 0 8px;
}
.or-routing__field-error {
  margin: 4px 0 0;
  font-size: var(--app-text-xs);
  color: var(--el-color-danger);
}
.or-switch {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.or-switch__label {
  font-weight: var(--app-weight-strong);
  font-size: var(--app-text-md);
}
.or-switch .app-form-hint {
  margin: 2px 0 0;
}
.or-mode {
  flex-wrap: wrap;
}
.or-mode__hint {
  width: 100%;
}
.or-state {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 8px;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
.or-table :deep(.or-row.is-excluded) {
  opacity: 0.55;
}
.or-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}
.or-name__provider {
  font-weight: var(--app-weight-strong);
  word-break: break-word;
}
.or-name__slug {
  font-size: var(--app-text-xs);
  overflow-wrap: anywhere;
}
.or-facts {
  margin: 2px 0 0;
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
/* A pair of figures breaks at its slash, never inside a figure. */
.or-price,
.or-uptime {
  font-variant-numeric: tabular-nums;
}
.or-covered {
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
.or-order {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.or-order .el-button + .el-button {
  margin-left: 0;
}
.or-order__position {
  margin-right: 4px;
  font-variant-numeric: tabular-nums;
}
.or-tip__line,
.or-tip__link {
  display: block;
}
.or-tip__link {
  color: inherit;
  text-decoration: underline;
}
.or-cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.or-card {
  padding: 10px 12px;
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-control);
}
.or-card.is-excluded {
  opacity: 0.55;
}
.or-card__figures {
  margin: 4px 0 0;
  font-size: var(--app-text-xs);
  color: var(--app-ink-2);
}
.or-card__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}
.or-listed {
  margin: 6px 0 0;
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
.or-skipped {
  margin: 8px 0 0;
  font-size: var(--app-text-sm);
}
.or-skipped__item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 8px;
}
.or-add {
  margin-top: 12px;
}
.or-add__row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.or-add__input {
  flex: 1;
  min-width: 0;
}
.or-speed__label {
  margin: 4px 0 6px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
}
.or-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 12px;
}
.or-grid :deep(.el-input-number) {
  width: 100%;
}
.or-quantizations__group {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
}
.or-prices__line {
  margin: 8px 0 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.or-preview {
  margin: 16px 0 8px;
}
@media (max-width: 639px) {
  .or-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
