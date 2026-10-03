<script setup lang="ts">
// The school's key for an offer, as far as it is ever shown: its hint, and
// whether it passed a trial of the offer's model. runtime.yaml's keys are
// files on the server, of which nothing is shown.
import AppTag from '@/components/AppTag.vue'
import { toneOf } from '@/components/tags'
import { useI18n } from 'vue-i18n'
import type { PlanOffer } from '@/api/runtime-types'

defineProps<{ offer: PlanOffer }>()
const { t } = useI18n()
</script>

<template>
  <div class="offer-key">
    <template v-if="offer.source === 'site'">
      <code v-if="offer.key_hint" class="offer-key__hint">{{ offer.key_hint }}</code>
      <AppTag v-if="offer.key_status" :tone="toneOf(offer.key_status === 'tested' ? 'success' : 'warning')" class="offer-key__status">
        {{ t(`runtimeAdmin.offers.${offer.key_status}`) }}
      </AppTag>
      <span v-if="offer.key_status === 'untested'" class="offer-key__why">{{
        t('runtimeAdmin.offers.untestedHint')
      }}</span>
    </template>
    <span v-else class="app-muted offer-key__server">{{ t('runtimeAdmin.offers.configKey') }}</span>
  </div>
</template>

<style scoped>
.offer-key {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  min-width: 0;
}
.offer-key__hint {
  font-size: 12px;
}
.offer-key__why {
  flex-basis: 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
