<script setup lang="ts">
// Today's use of the school's plan (GET admin/school-plan/usage), since
// 00:00 UTC: answers, model calls and their cost on the school's keys, in
// all and per owner, against the quotas in force. Counts and costs only,
// never what anyone wrote. The runtime has answered this before it had the
// plan's other routes, so it is there on an older one too. Its cost is the
// answers' model calls alone (the runtime's kind 'model_calls'), while the
// whole school's ceiling in dollars counts the transcription of documents
// too, so the card says so beside that ceiling.
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtimeAdmin } from '@/api/runtime'
import type { OwnerPlanUse } from '@/api/runtime-types'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import DailyReset from '@/components/DailyReset.vue'
import IdText from '@/components/IdText.vue'
import TimeText from '@/components/TimeText.vue'
import RuntimeAsync from './RuntimeAsync.vue'
import { formatCount, formatMoney } from '@/utils/format'
import { joinParts } from '@/utils/parts'

const { t } = useI18n()
// A phone's layout, an owner's model calls and cost under their name, where the
// card is as narrow as on a phone: its title 542 px or less, the width it has
// in a window of 640 px without the side bar. By the card's own width, not the
// window's: the side bar takes from it.
const cardTitle = useTemplateRef<HTMLElement>('cardTitle')
const narrow = useContainerNarrow(cardTitle, 542)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)

const usage = useAsync(() => runtimeAdmin.usage().then((r) => r.data), { keepData: true })
const data = computed(() => usage.data.value ?? null)
/** The busiest first. */
const owners = computed(() => [...(data.value?.owners ?? [])].sort((a, b) => b.answers - a.answers))
const spent = (o: OwnerPlanUse) => !!data.value && !!o.owner_actor_id && o.answers >= data.value.limits.per_owner_day
/** The quotas in dollars in force, where the runtime has any. */
const usdLimits = computed(() => {
  const l = data.value?.limits
  if (!l || (l.per_owner_day_usd == null && l.per_asker_day_usd == null && l.per_day_usd == null)) return null
  const shown = (v: string | null | undefined) => (v == null ? t('runtimeAdmin.money.noLimit') : formatMoney(v))
  return { owner: shown(l.per_owner_day_usd), asker: shown(l.per_asker_day_usd), day: shown(l.per_day_usd) }
})
const schoolSpent = computed(() => {
  const d = data.value
  return !!d && d.limits.per_day !== null && d.total.answers >= d.limits.per_day
})
</script>

<template>
  <section class="app-card usage-card">
    <h2 ref="cardTitle" class="app-card__title">
      <span>{{ t('runtimeAdmin.usage.title') }}</span>
      <el-button
        circle
        :loading="usage.loading.value"
        :aria-label="t('common.actions.refresh')"
        class="usage-card__refresh"
        @click="usage.reload"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </h2>
    <RuntimeAsync
      :loading="usage.loading.value && !data"
      :error="data ? null : usage.error.value"
      @retry="usage.reload"
    >
      <template v-if="data">
        <p class="usage-card__since">
          <i18n-t keypath="runtimeAdmin.usage.since" tag="span" scope="global">
            <template #since><TimeText :value="data.since" /></template>
            <template #reset><DailyReset :since="data.since" /></template>
          </i18n-t>
        </p>
        <dl class="usage-card__totals">
          <div class="usage-card__total">
            <dt>{{ t('runtimeAdmin.usage.answers') }}</dt>
            <dd class="usage-card__answers" :class="{ 'is-spent': schoolSpent }">
              {{ formatCount(data.total.answers) }}
            </dd>
            <dd class="usage-card__of">
              {{
                data.limits.per_day !== null
                  ? t('runtimeAdmin.usage.ofDay', { n: formatCount(data.limits.per_day) })
                  : t('runtimeAdmin.usage.noCeiling')
              }}
            </dd>
          </div>
          <div class="usage-card__total">
            <dt>{{ t('runtimeAdmin.usage.modelCalls') }}</dt>
            <dd class="usage-card__calls">{{ formatCount(data.total.model_calls) }}</dd>
          </div>
          <div class="usage-card__total">
            <dt>{{ t('runtimeAdmin.usage.cost') }}</dt>
            <dd class="usage-card__cost">{{ formatMoney(data.total.cost_usd) }}</dd>
            <dd v-if="data.limits.per_day_usd != null" class="usage-card__of usage-card__of-usd">
              {{ t('runtimeAdmin.usage.ofDay', { n: formatMoney(data.limits.per_day_usd) }) }}
            </dd>
          </div>
        </dl>
        <p class="app-form-hint usage-card__limits">
          {{
            t('runtimeAdmin.usage.limits', {
              owner: formatCount(data.limits.per_owner_day),
              asker: formatCount(data.limits.per_asker_day),
            })
          }}
          <template v-if="usdLimits">
            {{ t('runtimeAdmin.usage.limitsUsd', usdLimits) }}
            <span v-if="data.limits.per_day_usd != null" class="usage-card__no-transcription">{{
              t('runtimeAdmin.usage.noTranscription')
            }}</span>
          </template>
        </p>

        <el-empty v-if="!owners.length" :description="t('runtimeAdmin.usage.empty')" class="usage-card__empty" />
        <el-table v-else ref="tableRef" :data="owners" row-key="tenant_id" class="usage-card__table">
          <el-table-column :label="t('runtimeAdmin.usage.owner')" min-width="200">
            <template #default="{ row }">
              <div class="usage-owner">
                <router-link
                  v-if="row.owner_actor_id && row.display_name"
                  :to="{ name: 'admin-actor', params: { actorId: row.owner_actor_id } }"
                  class="usage-owner__name"
                  >{{ row.display_name }}</router-link
                >
                <span v-else-if="row.owner_actor_id" class="usage-owner__unknown">
                  {{ t('runtimeAdmin.usage.unknownOwner') }} <IdText :id="row.owner_actor_id" />
                </span>
                <span v-else class="usage-owner__operator">
                  {{ t('runtimeAdmin.usage.operator') }} <code class="app-muted">{{ row.tenant_id }}</code>
                </span>
                <span v-if="narrow" class="usage-owner__meta">
                  {{
                    joinParts([
                      t('common.pair', {
                        label: t('runtimeAdmin.usage.modelCalls'),
                        value: formatCount(row.model_calls),
                      }),
                      formatMoney(row.cost_usd),
                    ])
                  }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('runtimeAdmin.usage.answers')" min-width="120" align="right">
            <template #default="{ row }">
              <span class="usage-owner__answers" :class="{ 'is-spent': spent(row) }">
                {{ formatCount(row.answers)
                }}<span v-if="row.owner_actor_id" class="app-muted">
                  / {{ formatCount(data.limits.per_owner_day) }}</span
                >
              </span>
              <el-tag v-if="spent(row)" type="warning" size="small" disable-transitions class="usage-owner__spent">
                {{ t('runtimeAdmin.usage.spent') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('runtimeAdmin.usage.modelCalls')" min-width="110" align="right">
            <template #default="{ row }"
              ><span class="usage-owner__num">{{ formatCount(row.model_calls) }}</span></template
            >
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('runtimeAdmin.usage.cost')" min-width="110" align="right">
            <template #default="{ row }"
              ><span class="usage-owner__num">{{ formatMoney(row.cost_usd) }}</span></template
            >
          </el-table-column>
        </el-table>
      </template>
    </RuntimeAsync>
  </section>
</template>

<style scoped>
/* The totals follow the card's own width: side by side while each keeps 160 px. */
.usage-card {
  container-type: inline-size;
}
.usage-card__since {
  margin: -8px 0 12px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.usage-card__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 8px;
}
.usage-card__total {
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-control);
  min-width: 0;
}
.usage-card__total dt {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.usage-card__total dd {
  margin: 0;
}
.usage-card__answers,
.usage-card__calls,
.usage-card__cost {
  font-size: var(--app-text-2xl);
  font-weight: var(--app-heading-weight);
  font-variant-numeric: tabular-nums;
}
.usage-card__of {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.is-spent {
  color: var(--el-color-warning);
}
.usage-card__limits {
  margin: 0 0 16px;
}
.usage-owner {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  word-break: break-word;
}
.usage-owner__meta {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.usage-owner__answers,
.usage-owner__num {
  font-variant-numeric: tabular-nums;
}
.usage-owner__spent {
  margin-left: 6px;
}
@container (max-width: 519px) {
  .usage-card__totals {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
