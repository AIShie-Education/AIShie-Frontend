<script setup lang="ts">
// Pricing and quotas: the money, as the site manages it beside the
// operator's price file and runtime.yaml, whose values stay the defaults,
// shown read-only. The price table, tenants' daily quotas on the school's
// key, hosted agents' daily budgets by default, and what things cost. A
// runtime from before these routes says so once, for the whole tab.
import { shallowRef } from 'vue'
import { runtime, runtimeAdmin } from '@/api/runtime'
import type { PriceTable, ProviderOffer } from '@/api/runtime-types'
import { useAsync } from '@/composables/useAsync'
import AgentBudgetsCard from './AgentBudgetsCard.vue'
import CostsCard from './CostsCard.vue'
import PricesCard from './PricesCard.vue'
import RuntimeAsync from './RuntimeAsync.vue'
import TenantsCard from './TenantsCard.vue'

const prices = useAsync(() => runtimeAdmin.prices().then((r) => r.data), { keepData: true })

/** The providers the runtime takes keys for, offered in the price dialog; another may be typed. */
const providers = shallowRef<ProviderOffer[] | null>(null)
runtime.models().then(
  (r) => (providers.value = r.data.own_key?.providers ?? []),
  () => (providers.value = []),
)

function onTable(t: PriceTable) {
  prices.data.value = t
}
</script>

<template>
  <div class="pricing">
    <section v-if="!prices.data.value" class="app-card pricing__state">
      <RuntimeAsync :loading="prices.loading.value" :error="prices.error.value" @retry="prices.reload" />
    </section>
    <template v-else>
      <PricesCard
        :table="prices.data.value"
        :providers="providers"
        :refreshing="prices.loading.value"
        @changed="prices.reload"
        @update="onTable"
      />
      <TenantsCard />
      <AgentBudgetsCard />
      <CostsCard />
    </template>
  </div>
</template>
