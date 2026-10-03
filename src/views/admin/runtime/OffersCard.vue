<script setup lang="ts">
// The models on the school's plan (its offers): runtime.yaml's first, the
// operator's and read-only here, then the site's, which are added, edited,
// turned off and on, and deleted here. Each says how it stands, its key as
// far as it is shown, and how many hosted agents name it. Turning off or
// deleting one that agents are on says first what becomes of them: those
// whose owners have a model of their own behind it go on with that, the
// others wait for their owners to choose again. A change names the version
// read (If-Match); one made meanwhile elsewhere (412) reads the plan again
// and says so. An offer with OpenRouter's upstream routing says so beside
// its ID, and shows what is sent on asking: runtime.yaml's as well, which
// has no dialog.
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isRuntimeError, isVersionMismatch, runtimeAdmin } from '@/api/runtime'
import type { PlanOffer, ProviderOffer, SchoolPlan } from '@/api/runtime-types'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { providerLabel } from '@/views/account/components/agents/hosting'
import AppEmpty from '@/components/AppEmpty.vue'
import JsonView from '@/components/JsonView.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import OfferDialog from './OfferDialog.vue'
import OfferKey from './OfferKey.vue'
import OfferStatus from './OfferStatus.vue'
import { adminErrorText } from './runtimeAdmin'
import { joinParts } from '@/utils/parts'

const props = defineProps<{
  plan: SchoolPlan
  /** The providers the runtime takes keys for (GET /models), or null until read. */
  providers: ProviderOffer[] | null
  providersError?: unknown
  /** The plan is being read again. */
  refreshing?: boolean
}>()
const emit = defineEmits<{
  /** The plan should be read again. */
  changed: []
  reloadProviders: []
}>()
const { t } = useI18n()
// Every column where the card has the 810 px they take; with less, an offer's
// status, key, agents and actions go under its name. By the card's own width
// (its title's), not the window's: the side bar takes from it.
const cardTitle = useTemplateRef<HTMLElement>('cardTitle')
const narrow = useContainerNarrow(cardTitle, 809)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)

const offers = computed(() => props.plan.offers ?? [])
const rowKey = (o: PlanOffer) => `${o.source}:${o.id}`
const providerName = (p: string) => providerLabel(props.providers, p)

/** Where the model is called, where the provider takes a choice: its endpoint, Azure resource or AWS region. */
function where(o: PlanOffer): string {
  if (o.resource) return o.resource
  if (o.region) return o.region
  if (o.endpoint) {
    const offer = props.providers?.find((p) => p.provider === o.provider)
    const choice =
      offer?.endpoint.kind === 'choice' ? offer.endpoint.choices.find((c) => c.id === o.endpoint) : undefined
    return choice?.label ?? o.endpoint
  }
  return ''
}

// --- Writes ---------------------------------------------------------------------------
const busy = ref<string | null>(null)
const error = shallowRef<unknown>(null)

/** A refusal: said above the list, and the plan read again when it moved on or the offer is gone. */
function onError(e: unknown) {
  if (isVersionMismatch(e)) {
    ElMessage({ type: 'warning', message: t('runtimeAdmin.offers.changedMeanwhile'), duration: 6000, showClose: true })
    emit('changed')
    return
  }
  if (isRuntimeError(e) && e.reason === 'offer_not_found') {
    ElMessage({ type: 'info', message: t('runtimeAdmin.errors.offer_not_found') })
    emit('changed')
    return
  }
  error.value = e
}

async function confirmed(message: string, title: string, confirmButtonText: string): Promise<boolean> {
  return ElMessageBox.confirm(message, title, {
    type: 'warning',
    confirmButtonText,
    cancelButtonText: t('common.actions.cancel'),
    confirmButtonClass: 'el-button--danger',
  }).then(
    () => true,
    () => false,
  )
}

async function toggle(o: PlanOffer, on: string | number | boolean) {
  const enabled = on === true
  if (busy.value || o.source !== 'site' || o.version === null) return
  if (!enabled && o.agents > 0) {
    const ok = await confirmed(
      t('runtimeAdmin.offers.turnOff', { n: o.agents }, o.agents),
      t('runtimeAdmin.offers.turnOffTitle', { label: o.label }),
      t('runtimeAdmin.offers.turnOffConfirm'),
    )
    if (!ok) return
  }
  busy.value = rowKey(o)
  error.value = null
  try {
    await runtimeAdmin.updateOffer(o.id, o.version, { enabled })
    ElMessage({
      type: 'success',
      message: t(enabled ? 'runtimeAdmin.offers.turnedOn' : 'runtimeAdmin.offers.turnedOff', { label: o.label }),
    })
    emit('changed')
  } catch (e) {
    onError(e)
  } finally {
    busy.value = null
  }
}

async function remove(o: PlanOffer) {
  if (busy.value || o.source !== 'site') return
  const body = `${t('runtimeAdmin.offers.deleteBody', { n: o.agents }, o.agents)} ${o.agents ? t('runtimeAdmin.offers.deleteAgain') : ''}`
  const ok = await confirmed(
    body.trim(),
    t('runtimeAdmin.offers.deleteTitle', { label: o.label }),
    t('common.actions.delete'),
  )
  if (!ok) return
  busy.value = rowKey(o)
  error.value = null
  try {
    const r = await runtimeAdmin.deleteOffer(o.id, o.version ?? undefined)
    const n = r.data?.agents ?? 0
    ElMessage({ type: 'success', message: t('runtimeAdmin.offers.deleted', { label: o.label, n }, n) })
    emit('changed')
  } catch (e) {
    // Gone already (deleted meanwhile, or a first try whose answer was lost): nothing left to do.
    if (isRuntimeError(e) && e.reason === 'offer_not_found') {
      ElMessage({ type: 'info', message: t('runtimeAdmin.offers.gone') })
      emit('changed')
    } else onError(e)
  } finally {
    busy.value = null
  }
}

// --- The dialog -------------------------------------------------------------------------
const dialogOpen = ref(false)
const editing = shallowRef<PlanOffer | null>(null)
const takenIds = computed(() => offers.value.map((o) => o.id))

function openCreate() {
  editing.value = null
  dialogOpen.value = true
}
function openEdit(o: PlanOffer) {
  editing.value = o
  dialogOpen.value = true
}
</script>

<template>
  <section class="app-card offers-card">
    <h2 ref="cardTitle" class="app-card__title">
      <span>{{ t('runtimeAdmin.offers.title') }}</span>
      <span class="offers-card__head">
        <RefreshButton :loading="refreshing" class="offers-card__refresh" @click="emit('changed')" />
        <el-button type="primary" class="offers-card__add" @click="openCreate">
          <el-icon><Plus /></el-icon>
          <span>{{ t('runtimeAdmin.offers.add') }}</span>
        </el-button>
      </span>
    </h2>
    <p class="offers-card__intro">{{ t('runtimeAdmin.offers.intro') }}</p>

    <el-alert
      v-if="error"
      type="error"
      show-icon
      :title="adminErrorText(error, t)"
      class="offers-card__error"
      @close="error = null"
    />

    <AppEmpty v-if="!offers.length" :text="t('runtimeAdmin.offers.empty')" class="offers-card__empty" />
    <el-table v-else ref="tableRef" :data="offers" :row-key="rowKey" class="offers-card__table">
      <el-table-column :label="t('runtimeAdmin.offers.model')" :min-width="narrow ? 240 : 230">
        <template #default="{ row }">
          <div class="offer-cell" :data-offer="rowKey(row)">
            <span class="offer-cell__label">{{ row.label }}</span>
            <span class="offer-cell__model">{{ joinParts([providerName(row.provider), row.model]) }}</span>
            <span class="offer-cell__meta">
              <code class="offer-cell__id">{{ row.id }}</code>
              <template v-if="where(row)">{{ t('common.sep') }}{{ where(row) }}</template>
              <template v-if="row.openrouter"
                >{{ t('common.sep')
                }}<el-popover
                  trigger="click"
                  :width="360"
                  placement="bottom-start"
                  :title="t('runtimeAdmin.offers.routingTitle')"
                >
                  <template #reference>
                    <el-button link type="primary" size="small" class="offer-cell__routing">{{
                      t('runtimeAdmin.offers.routing')
                    }}</el-button>
                  </template>
                  <JsonView
                    :value="{ provider: row.openrouter }"
                    max-height="320px"
                    class="offer-cell__routing-json"
                  /> </el-popover
              ></template>
            </span>
            <template v-if="narrow">
              <OfferStatus :offer="row" />
              <OfferKey :offer="row" />
              <span class="offer-cell__agents">{{
                t('common.pair', { label: t('runtimeAdmin.offers.agents'), value: row.agents })
              }}</span>
              <div v-if="row.source === 'site'" class="offer-cell__actions">
                <el-button link type="primary" :disabled="!!busy" class="offer-cell__edit" @click="openEdit(row)">
                  {{ t('runtimeAdmin.offers.edit') }}
                </el-button>
                <el-button link type="danger" :disabled="!!busy" class="offer-cell__delete" @click="remove(row)">
                  {{ t('runtimeAdmin.offers.delete') }}
                </el-button>
              </div>
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column v-if="!narrow" :label="t('runtimeAdmin.offers.status')" min-width="170">
        <template #default="{ row }"><OfferStatus :offer="row" /></template>
      </el-table-column>
      <el-table-column v-if="!narrow" :label="t('runtimeAdmin.offers.key')" min-width="140">
        <template #default="{ row }"><OfferKey :offer="row" /></template>
      </el-table-column>
      <el-table-column v-if="!narrow" :label="t('runtimeAdmin.offers.agents')" min-width="70" align="right">
        <template #default="{ row }"
          ><span class="offer-cell__count">{{ row.agents }}</span></template
        >
      </el-table-column>
      <el-table-column :label="t('runtimeAdmin.offers.offered')" min-width="80">
        <template #default="{ row }">
          <el-switch
            v-if="row.source === 'site'"
            :model-value="row.enabled"
            :loading="busy === rowKey(row)"
            :disabled="!!busy && busy !== rowKey(row)"
            :aria-label="t('runtimeAdmin.offers.enabledLabel', { label: row.label })"
            class="offer-cell__enabled"
            @change="toggle(row, $event)"
          />
          <span v-else class="app-muted offer-cell__always">{{ t('runtimeAdmin.offers.always') }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="!narrow" :label="t('runtimeAdmin.offers.actions')" min-width="120">
        <template #default="{ row }">
          <div v-if="row.source === 'site'" class="offer-cell__actions">
            <el-button link type="primary" :disabled="!!busy" class="offer-cell__edit" @click="openEdit(row)">
              {{ t('runtimeAdmin.offers.edit') }}
            </el-button>
            <el-button link type="danger" :disabled="!!busy" class="offer-cell__delete" @click="remove(row)">
              {{ t('runtimeAdmin.offers.delete') }}
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <OfferDialog
      v-model="dialogOpen"
      :offer="editing"
      :providers="providers"
      :providers-error="providersError"
      :taken-ids="takenIds"
      @saved="emit('changed')"
      @changed="emit('changed')"
      @reload-providers="emit('reloadProviders')"
    />
  </section>
</template>

<style scoped>
.offers-card__head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.offers-card__head .el-button + .el-button {
  margin-left: 0;
}
.offers-card__intro {
  margin: -8px 0 16px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.offers-card__error {
  margin-bottom: 12px;
}
.offer-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.offer-cell__label {
  font-weight: var(--app-weight-strong);
  word-break: break-word;
}
.offer-cell__model {
  font-size: var(--app-text-sm);
  word-break: break-word;
}
.offer-cell__meta,
.offer-cell__agents {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
.offer-cell__routing.el-button {
  height: auto;
  padding: 0;
  font-size: inherit;
  vertical-align: baseline;
}
.offer-cell__count {
  font-variant-numeric: tabular-nums;
}
.offer-cell__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.offer-cell__actions .el-button + .el-button {
  margin-left: 0;
}
.offer-cell__always,
.offer-cell__read-only {
  font-size: var(--app-text-xs);
}
</style>
