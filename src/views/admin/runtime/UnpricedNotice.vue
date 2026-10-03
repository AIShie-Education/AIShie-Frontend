<script setup lang="ts">
// Models of the school's plan the price table has no price for today, which
// a quota in dollars cannot hold (the table's unpriced_offers, or an
// offer_not_priced refusal's details.offers): each with "Add a price",
// which opens the price dialog with its provider, model and today's date.
// Once priced, it says so, for the administrator to try again.
import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PriceRow, ProviderOffer } from '@/api/runtime-types'
import PriceDialog from './PriceDialog.vue'
import type { PriceForm, UnpricedItem } from './runtimeAdmin'
import { joinParts } from '@/utils/parts'

defineProps<{
  items: UnpricedItem[]
  title: string
  providers?: ProviderOffer[] | null
  /** The price table's ids, where known. */
  takenIds?: readonly string[]
}>()
const emit = defineEmits<{ priced: [row: PriceRow] }>()
const { t } = useI18n()

const priced = ref<Set<string>>(new Set())
const open = ref(false)
const prefill = shallowRef<Partial<PriceForm> | null>(null)
const adding = ref<string | null>(null)

function add(item: UnpricedItem) {
  adding.value = item.id
  prefill.value = { provider: item.provider, model: item.model }
  open.value = true
}
function onSaved(row: PriceRow) {
  if (adding.value) priced.value = new Set([...priced.value, adding.value])
  emit('priced', row)
}
</script>

<template>
  <el-alert type="warning" :closable="false" show-icon :title="title" class="unpriced">
    <ul class="unpriced__list">
      <li v-for="item in items" :key="item.id" class="unpriced__item" :data-offer="item.id">
        <span class="unpriced__what">
          <span v-if="item.label" class="unpriced__label">{{ item.label }}</span>
          <code class="unpriced__model">{{ joinParts([item.provider, item.model]) }}</code>
        </span>
        <span v-if="priced.has(item.id)" class="unpriced__done">{{ t('runtimeAdmin.prices.priced') }}</span>
        <el-button v-else size="small" class="unpriced__add" @click="add(item)">
          {{ t('runtimeAdmin.prices.addFor') }}
        </el-button>
      </li>
    </ul>
    <PriceDialog
      v-model="open"
      :prefill="prefill"
      :providers="providers"
      :taken-ids="takenIds ?? []"
      @saved="onSaved"
    />
  </el-alert>
</template>

<style scoped>
.unpriced__list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.unpriced__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
}
.unpriced__what {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  min-width: 0;
  word-break: break-word;
}
.unpriced__label {
  font-weight: 600;
}
.unpriced__model {
  font-size: 12px;
}
.unpriced__done {
  font-size: 12px;
  color: var(--el-color-success);
}
</style>
