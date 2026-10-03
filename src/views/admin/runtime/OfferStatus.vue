<script setup lang="ts">
// How an offer of the school's plan stands, in tags, and why where it is not
// offered: turned off, shadowed by runtime.yaml's offer of the same id, or
// its model no longer allowed; whether it is the operator's (runtime.yaml,
// read-only here), and whether the runtime's price table prices its model.
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { useI18n } from 'vue-i18n'
import type { PlanOffer } from '@/api/runtime-types'
import { OFFER_STATUS_TAG } from './runtimeAdmin'

defineProps<{ offer: PlanOffer }>()
const { t } = useI18n()
</script>

<template>
  <div class="offer-status">
    <div class="offer-status__tags">
      <AppTag :tone="toneOf(OFFER_STATUS_TAG[offer.status])" class="offer-status__status">
        {{ t(`runtimeAdmin.offers.statuses.${offer.status}`) }}
      </AppTag>
      <AppTag v-if="offer.source === 'config'" variant="outline" class="offer-status__config">
        {{ t('runtimeAdmin.offers.config') }}
      </AppTag>
      <AppTag v-if="!offer.priced" tone="wait" class="offer-status__unpriced">
        {{ t('runtimeAdmin.offers.unpriced') }}
      </AppTag>
    </div>
    <span v-if="offer.source === 'config'" class="offer-status__why">{{ t('runtimeAdmin.offers.why.config') }}</span>
    <span v-if="offer.status !== 'offered'" class="offer-status__why">
      {{ t(`runtimeAdmin.offers.why.${offer.status}`) }}
    </span>
    <span v-if="!offer.priced" class="offer-status__why">{{ t('runtimeAdmin.offers.unpricedHint') }}</span>
  </div>
</template>

<style scoped>
.offer-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.offer-status__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.offer-status__why {
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
</style>
