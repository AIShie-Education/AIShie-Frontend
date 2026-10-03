<script setup lang="ts">
// The price table (GET admin/prices): the operator's price file's rows,
// read-only here, with the site's before them, which are added, edited and
// deleted here. A model is priced by its provider's rows that match it from
// a day on (a pattern with * matches many); a site's row of the same
// provider, model and day stands before the file's, which shows as replaced.
// Every cost the ledger records names the row and the table's version it was
// priced by, so a change applies to calls from now on, and recorded costs
// keep their price. The plan's models no row prices today are listed first,
// each with "Add a price": a quota in dollars cannot hold them.
import AppTag from '@/components/AppTag.vue'
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, isVersionMismatch, runtimeAdmin } from '@/api/runtime'
import type { PriceRow, PriceTable, ProviderOffer } from '@/api/runtime-types'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { problemsOf } from '@/views/account/components/agents/hosting'
import PriceDialog from './PriceDialog.vue'
import UnpricedNotice from './UnpricedNotice.vue'
import { adminErrorText } from './runtimeAdmin'

const props = defineProps<{
  table: PriceTable
  providers?: ProviderOffer[] | null
  refreshing?: boolean
}>()
const emit = defineEmits<{
  /** The table should be read again. */
  changed: []
  /** The table as a deletion left it. */
  update: [table: PriceTable]
}>()
const { t } = useI18n()
// Every column where the card has the 670 px they take; with less, a row's four
// prices and its actions go under its model. By the card's own width (its
// title's), not the window's: the side bar takes from it.
const cardTitle = useTemplateRef<HTMLElement>('cardTitle')
const narrow = useContainerNarrow(cardTitle, 669)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)

/** By provider, then model and day: the site's before the file's of the same. */
const rows = computed(() =>
  [...(props.table.rows ?? [])].sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) ||
      a.model.localeCompare(b.model) ||
      b.from.localeCompare(a.from) ||
      (a.source === b.source ? 0 : a.source === 'site' ? -1 : 1),
  ),
)
const rowKey = (r: PriceRow) => `${r.source}:${r.id}`
const siteIds = computed(() => (props.table.rows ?? []).filter((r) => r.source === 'site').map((r) => r.id))
const unpriced = computed(() =>
  (props.table.unpriced_offers ?? []).map((o) => ({ id: o.id, provider: o.provider, model: o.model })),
)

const dialogOpen = ref(false)
const editing = shallowRef<PriceRow | null>(null)
function openCreate() {
  editing.value = null
  dialogOpen.value = true
}
function openEdit(r: PriceRow) {
  editing.value = r
  dialogOpen.value = true
}

const busy = ref<string | null>(null)
const error = shallowRef<unknown>(null)
const errorProblems = computed(() => problemsOf(error.value))

async function remove(r: PriceRow) {
  if (busy.value || r.source !== 'site') return
  const ok = await ElMessageBox.confirm(
    t('runtimeAdmin.prices.deleteBody'),
    t('runtimeAdmin.prices.deleteTitle', { model: r.model, from: r.from }),
    {
      type: 'warning',
      confirmButtonText: t('common.actions.delete'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).then(
    () => true,
    () => false,
  )
  if (!ok) return
  busy.value = rowKey(r)
  error.value = null
  try {
    const out = await runtimeAdmin.deletePrice(r.id, r.row_version ?? undefined)
    ElMessage({ type: 'success', message: t('runtimeAdmin.prices.deleted', { model: r.model, from: r.from }) })
    emit('update', out.data)
  } catch (e) {
    if (isVersionMismatch(e) || (isRuntimeError(e) && e.reason === 'price_not_found')) {
      ElMessage({
        type: 'warning',
        message: t('runtimeAdmin.prices.changedMeanwhile'),
        duration: 6000,
        showClose: true,
      })
      emit('changed')
    } else error.value = e
  } finally {
    busy.value = null
  }
}

const PRICE_KEYS = ['input', 'cache_read', 'cache_write', 'output'] as const
</script>

<template>
  <section id="runtime-prices" class="app-card prices-card">
    <h2 ref="cardTitle" class="app-card__title">
      <span>{{ t('runtimeAdmin.prices.title') }}</span>
      <span class="prices-card__head">
        <el-button
          circle
          :loading="refreshing"
          :aria-label="t('common.actions.refresh')"
          class="prices-card__refresh"
          @click="emit('changed')"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button type="primary" class="prices-card__add" @click="openCreate">
          <el-icon><Plus /></el-icon>
          <span>{{ t('runtimeAdmin.prices.add') }}</span>
        </el-button>
      </span>
    </h2>
    <p class="prices-card__intro">{{ t('runtimeAdmin.prices.intro') }}</p>
    <p v-if="table.version" class="app-form-hint prices-card__version">
      {{ t('runtimeAdmin.prices.version', { version: table.version }) }}
    </p>

    <UnpricedNotice
      v-if="unpriced.length"
      :items="unpriced"
      :title="t('runtimeAdmin.prices.unpricedTitle')"
      :providers="providers"
      :taken-ids="siteIds"
      class="prices-card__unpriced"
      @priced="emit('changed')"
    />

    <el-alert
      v-if="error"
      type="error"
      show-icon
      :title="adminErrorText(error, t)"
      class="prices-card__error"
      @close="error = null"
    >
      <ul v-if="errorProblems.length" class="prices-card__problems">
        <li v-for="(p, i) in errorProblems" :key="i">{{ p }}</li>
      </ul>
    </el-alert>

    <el-empty v-if="!rows.length" :description="t('runtimeAdmin.prices.empty')" class="prices-card__empty" />
    <el-table v-else ref="tableRef" :data="rows" :row-key="rowKey" class="prices-card__table">
      <el-table-column :label="t('runtimeAdmin.prices.model')" min-width="230">
        <template #default="{ row }">
          <div class="price-cell" :data-price="rowKey(row)" :class="{ 'is-overridden': row.overridden }">
            <span class="price-cell__model">
              <span class="price-cell__name">{{ row.model }}</span>
              <AppTag v-if="row.glob" variant="outline" class="price-cell__glob">
                {{ t('runtimeAdmin.prices.pattern') }}
              </AppTag>
              <AppTag variant="outline" class="price-cell__source-tag">
                {{ t(`runtimeAdmin.prices.sources.${row.source}`) }}
              </AppTag>
            </span>
            <span class="price-cell__meta">
              {{ row.provider }} · <code>{{ row.id }}</code> ·
              <span class="price-cell__from">{{ t('runtimeAdmin.prices.fromDay', { day: row.from }) }}</span>
            </span>
            <span v-if="row.overridden" class="price-cell__replaced">{{ t('runtimeAdmin.prices.overridden') }}</span>
            <template v-if="narrow">
              <span class="price-cell__meta price-cell__all">
                <span v-for="k in PRICE_KEYS" :key="k" class="price-cell__price"
                  >{{ t(`runtimeAdmin.prices.short.${k}`) }} ${{ row.usd_per_mtok[k] }}</span
                >
              </span>
              <div v-if="row.source === 'site'" class="price-cell__actions">
                <el-button link type="primary" :disabled="!!busy" class="price-cell__edit" @click="openEdit(row)">
                  {{ t('runtimeAdmin.offers.edit') }}
                </el-button>
                <el-button link type="danger" :disabled="!!busy" class="price-cell__delete" @click="remove(row)">
                  {{ t('runtimeAdmin.offers.delete') }}
                </el-button>
              </div>
            </template>
          </div>
        </template>
      </el-table-column>
      <template v-if="!narrow">
        <el-table-column
          v-for="k in PRICE_KEYS"
          :key="k"
          :label="t(`runtimeAdmin.prices.column.${k}`)"
          min-width="84"
          align="right"
        >
          <template #default="{ row }">
            <span class="price-cell__num" :class="`price-cell__${k}`">${{ row.usd_per_mtok[k] }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('runtimeAdmin.offers.actions')" min-width="104">
          <template #default="{ row }">
            <div v-if="row.source === 'site'" class="price-cell__actions">
              <el-button link type="primary" :disabled="!!busy" class="price-cell__edit" @click="openEdit(row)">
                {{ t('runtimeAdmin.offers.edit') }}
              </el-button>
              <el-button link type="danger" :disabled="!!busy" class="price-cell__delete" @click="remove(row)">
                {{ t('runtimeAdmin.offers.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </template>
    </el-table>
    <p class="app-form-hint prices-card__note">{{ t('runtimeAdmin.prices.fromNowOn') }}</p>

    <PriceDialog
      v-model="dialogOpen"
      :row="editing"
      :providers="providers"
      :taken-ids="siteIds"
      @saved="emit('changed')"
      @changed="emit('changed')"
    />
  </section>
</template>

<style scoped>
.prices-card__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.prices-card__head .el-button + .el-button {
  margin-left: 0;
}
.prices-card__intro {
  margin: -8px 0 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.prices-card__version {
  margin: 0 0 12px;
  word-break: break-all;
}
.prices-card__unpriced,
.prices-card__error {
  margin-bottom: 12px;
}
.prices-card__problems {
  margin: 4px 0 0;
  padding-left: 18px;
  word-break: break-word;
}
.price-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.price-cell.is-overridden .price-cell__name {
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}
.price-cell__model {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  word-break: break-word;
}
.price-cell__name {
  font-weight: 600;
}
.price-cell__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
.price-cell__meta code {
  word-break: break-all;
}
/* Narrow, the four prices on a line of their own, apart. */
.price-cell__price + .price-cell__price {
  margin-left: 8px;
}
.price-cell__num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.price-cell__replaced {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
.price-cell__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.price-cell__actions .el-button + .el-button {
  margin-left: 0;
}
.prices-card__note {
  margin: 8px 0 0;
}
</style>
