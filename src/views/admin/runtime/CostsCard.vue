<script setup lang="ts">
// What things cost (GET admin/costs): the ledger's model calls in dollars,
// as each was priced when it was made, over a span of days (at most a
// year), by day, person, agent, model or key, on the school's key, owners'
// own, or both. The whole span's total heads it; a page of groups at a time
// follows. Calls no price held are counted as nothing, and say so, with the
// way to the prices. Costs come as lines by kind: model calls today, and
// another kind (a document's transcription) as a line of its own.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import { runtimeAdmin } from '@/api/runtime'
import type { CostGroup, CostGroupBy, CostLine, CostReport, CostSum, KeySource } from '@/api/runtime-types'
import { COST_GROUPS } from '@/api/runtime-types'
import { useNarrow } from '@/composables/useMediaQuery'
import IdText from '@/components/IdText.vue'
import LoadMore from '@/components/LoadMore.vue'
import { formatNumber } from '@/utils/format'
import RuntimeAsync from './RuntimeAsync.vue'
import { COST_SPAN_DAYS, costRange, usdShown, utcToday } from './runtimeAdmin'

const { t, te } = useI18n()
const narrow = useNarrow()

const range = ref<[string, string]>(costRange(utcToday()))
const group = ref<CostGroupBy>('day')
const keySource = ref<KeySource | 'all'>('all')
const tooLong = computed(() => dayjs(range.value[1]).diff(dayjs(range.value[0]), 'day') + 1 > COST_SPAN_DAYS)

const report = shallowRef<CostReport | null>(null)
const rows = ref<CostGroup[]>([])
const loading = ref(false)
const error = shallowRef<unknown>(null)
let generation = 0

async function load(more = false) {
  if (tooLong.value || !range.value?.[0]) return
  const g = more ? generation : ++generation
  loading.value = true
  error.value = null
  try {
    const r = await runtimeAdmin.costs({
      since: range.value[0],
      until: range.value[1],
      group: group.value,
      key_source: keySource.value === 'all' ? undefined : keySource.value,
      after: more ? (report.value?.next ?? undefined) : undefined,
    })
    if (g !== generation) return
    report.value = r.data
    rows.value = more ? [...rows.value, ...(r.data.rows ?? [])] : (r.data.rows ?? [])
  } catch (e) {
    if (g === generation) error.value = e
  } finally {
    if (g === generation) loading.value = false
  }
}
watch([range, group, keySource], () => void load(), { immediate: true })

const MODEL_CALLS = 'model_calls'
const callsOf = (s: CostSum): CostLine | undefined => (s.lines ?? []).find((l) => l.kind === MODEL_CALLS)
const otherLines = (s: CostSum) => (s.lines ?? []).filter((l) => l.kind !== MODEL_CALLS)
const kindName = (k: string) => (te(`runtimeAdmin.costs.kinds.${k}`) ? t(`runtimeAdmin.costs.kinds.${k}`) : k)
const n = (v: number | undefined) => formatNumber(v ?? 0, 0)
const total = computed(() => report.value?.total ?? null)
const totalCalls = computed(() => (total.value ? callsOf(total.value) : undefined))
const unpricedTotal = computed(() => (total.value?.lines ?? []).reduce((a, l) => a + (l.unpriced_calls ?? 0), 0))

function toPrices() {
  document.getElementById('runtime-prices')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section class="app-card costs-card">
    <h2 class="app-card__title">
      <span>{{ t('runtimeAdmin.costs.title') }}</span>
      <el-button
        circle
        :loading="loading"
        :aria-label="t('common.actions.refresh')"
        class="costs-card__refresh"
        @click="load()"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </h2>
    <p class="costs-card__intro">{{ t('runtimeAdmin.costs.intro') }}</p>

    <div class="costs-card__controls">
      <el-date-picker
        v-model="range"
        type="daterange"
        value-format="YYYY-MM-DD"
        format="YYYY-MM-DD"
        :clearable="false"
        :start-placeholder="t('runtimeAdmin.costs.since')"
        :end-placeholder="t('runtimeAdmin.costs.until')"
        :aria-label="t('runtimeAdmin.costs.span')"
        class="costs-card__range"
      />
      <el-select v-model="keySource" :aria-label="t('runtimeAdmin.costs.keys')" class="costs-card__keys">
        <el-option value="all" :label="t('runtimeAdmin.costs.keySources.all')" />
        <el-option value="school" :label="t('runtimeAdmin.costs.keySources.school')" />
        <el-option value="own" :label="t('runtimeAdmin.costs.keySources.own')" />
      </el-select>
    </div>
    <el-radio-group
      v-model="group"
      size="small"
      :aria-label="t('runtimeAdmin.costs.groupBy')"
      class="costs-card__groups"
    >
      <el-radio-button v-for="g in COST_GROUPS" :key="g" :value="g">{{
        t(`runtimeAdmin.costs.groups.${g}`)
      }}</el-radio-button>
    </el-radio-group>
    <p v-if="tooLong" class="costs-card__too-long" role="alert">{{ t('runtimeAdmin.costs.tooLong') }}</p>

    <RuntimeAsync v-else :loading="loading && !report" :error="error" @retry="load()">
      <template v-if="report && total">
        <dl class="costs-card__totals">
          <div class="costs-card__total">
            <dt>{{ t('runtimeAdmin.costs.cost') }}</dt>
            <dd class="costs-card__cost">${{ usdShown(total.cost_usd) }}</dd>
          </div>
          <div class="costs-card__total">
            <dt>{{ t('runtimeAdmin.usage.modelCalls') }}</dt>
            <dd class="costs-card__calls">{{ n(totalCalls?.calls) }}</dd>
          </div>
          <div class="costs-card__total">
            <dt>{{ t('runtimeAdmin.costs.tokens') }}</dt>
            <dd class="costs-card__tokens">
              {{
                t('runtimeAdmin.costs.inOut', {
                  input: n(totalCalls?.tokens?.input),
                  output: n(totalCalls?.tokens?.output),
                })
              }}
            </dd>
          </div>
        </dl>
        <p v-for="l in otherLines(total)" :key="l.kind" class="costs-card__other">
          {{
            t('runtimeAdmin.costs.otherLine', { kind: kindName(l.kind), calls: n(l.calls), usd: usdShown(l.cost_usd) })
          }}
        </p>
        <el-alert v-if="unpricedTotal" type="warning" :closable="false" show-icon class="costs-card__unpriced">
          <template #title>
            {{ t('runtimeAdmin.costs.unpriced', { n: n(unpricedTotal) }, unpricedTotal) }}
          </template>
          <el-button size="small" class="costs-card__to-prices" @click="toPrices">
            {{ t('runtimeAdmin.costs.toPrices') }}
          </el-button>
        </el-alert>

        <el-empty v-if="!rows.length" :description="t('runtimeAdmin.costs.empty')" class="costs-card__empty" />
        <el-table v-else :data="rows" row-key="key" class="costs-card__table">
          <el-table-column :label="t(`runtimeAdmin.costs.groupColumn.${report.group}`)" min-width="200">
            <template #default="{ row }">
              <div class="cost-cell" :data-key="row.key">
                <template v-if="report.group === 'day'">
                  <span class="cost-cell__day">{{ row.day ?? row.key }}</span>
                </template>
                <template v-else-if="report.group === 'tenant' || report.group === 'agent'">
                  <span v-if="report.group === 'agent'" class="cost-cell__agent">
                    {{ row.agent_name ?? '' }}
                    <code v-if="!row.agent_name" class="cost-cell__id">{{ row.agent_id ?? row.key }}</code>
                  </span>
                  <router-link
                    v-if="row.owner_actor_id && row.display_name"
                    :to="{ name: 'admin-actor', params: { actorId: row.owner_actor_id } }"
                    :class="report.group === 'agent' ? 'cost-cell__meta' : 'cost-cell__name'"
                    >{{ row.display_name }}</router-link
                  >
                  <IdText v-else-if="row.owner_actor_id" :id="row.owner_actor_id" />
                  <code v-else-if="row.tenant_id" class="cost-cell__id">{{ row.tenant_id }}</code>
                </template>
                <template v-else-if="report.group === 'model'">
                  <span class="cost-cell__model">{{ row.provider }} · {{ row.model }}</span>
                  <span class="cost-cell__meta">
                    {{ row.key_source ? t(`runtimeAdmin.costs.keySources.${row.key_source}`) : '' }}
                    <template v-if="row.offers?.length">
                      · {{ t('runtimeAdmin.costs.offers', { ids: row.offers.join(', ') }) }}</template
                    >
                  </span>
                </template>
                <template v-else-if="report.group === 'key_source'">
                  <span>{{ row.key_source ? t(`runtimeAdmin.costs.keySources.${row.key_source}`) : row.key }}</span>
                </template>
                <span v-else>{{ t('runtimeAdmin.costs.all') }}</span>
                <span v-if="narrow" class="cost-cell__meta">
                  {{ t('runtimeAdmin.usage.modelCalls') }}: {{ n(callsOf(row)?.calls) }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('runtimeAdmin.usage.modelCalls')" min-width="110" align="right">
            <template #default="{ row }">
              <span class="cost-cell__num">{{ n(callsOf(row)?.calls) }}</span>
              <el-tag
                v-if="callsOf(row)?.unpriced_calls"
                type="warning"
                size="small"
                disable-transitions
                class="cost-cell__unpriced"
              >
                {{ t('runtimeAdmin.costs.unpricedShort', { n: n(callsOf(row)?.unpriced_calls) }) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('runtimeAdmin.costs.tokens')" min-width="160" align="right">
            <template #default="{ row }">
              <span class="cost-cell__num cost-cell__tokens">
                {{
                  t('runtimeAdmin.costs.inOut', {
                    input: n(callsOf(row)?.tokens?.input),
                    output: n(callsOf(row)?.tokens?.output),
                  })
                }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('runtimeAdmin.costs.cost')" min-width="110" align="right">
            <template #default="{ row }">
              <span class="cost-cell__num cost-cell__cost">${{ usdShown(row.cost_usd) }}</span>
              <span v-for="l in otherLines(row)" :key="l.kind" class="cost-cell__other">
                {{ kindName(l.kind) }}: ${{ usdShown(l.cost_usd) }}
              </span>
              <el-tag
                v-if="narrow && callsOf(row)?.unpriced_calls"
                type="warning"
                size="small"
                disable-transitions
                class="cost-cell__unpriced"
              >
                {{ t('runtimeAdmin.costs.unpricedShort', { n: n(callsOf(row)?.unpriced_calls) }) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="!!report.next" :loading="loading" @more="load(true)" />
      </template>
    </RuntimeAsync>
  </section>
</template>

<style scoped>
/* The controls and totals follow the card's own width. */
.costs-card {
  container-type: inline-size;
}
.costs-card__intro {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.costs-card__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.costs-card__range {
  max-width: 100%;
}
.costs-card__keys {
  width: 200px;
  max-width: 100%;
}
.costs-card__groups {
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.costs-card__too-long {
  margin: 0;
  font-size: 13px;
  color: var(--el-color-danger);
}
.costs-card__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 8px;
}
.costs-card__total {
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-control);
  min-width: 0;
}
.costs-card__total dt {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.costs-card__total dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  word-break: break-word;
}
.costs-card__cost,
.costs-card__calls {
  font-size: 22px;
  font-weight: 600;
}
.costs-card__tokens {
  font-size: 14px;
  padding-top: 6px;
}
.costs-card__other {
  margin: 0 0 8px;
  font-size: 13px;
}
.costs-card__unpriced {
  margin-bottom: 12px;
}
.cost-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  word-break: break-word;
}
.cost-cell__meta,
.cost-cell__other {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.cost-cell__other {
  display: block;
}
.cost-cell__num {
  font-variant-numeric: tabular-nums;
}
.cost-cell__unpriced {
  margin-left: 6px;
}
@container (max-width: 559px) {
  .costs-card__totals {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
