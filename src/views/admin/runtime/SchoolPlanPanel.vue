<script setup lang="ts">
// The school's AI plan (GET admin/school-plan): the models on it and its
// daily quotas, read once for both, and again after every change to an
// offer. The providers the runtime offers keys for (GET /models), for their
// names and for the form of an offer, are read beside it.
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { runtime, runtimeAdmin } from '@/api/runtime'
import type { ProviderOffer, SchoolPlan } from '@/api/runtime-types'
import { useAsync } from '@/composables/useAsync'
import OffersCard from './OffersCard.vue'
import QuotasCard from './QuotasCard.vue'
import RuntimeAsync from './RuntimeAsync.vue'

const { t } = useI18n()

const plan = useAsync(() => runtimeAdmin.plan().then((r) => r.data), { keepData: true })

const providers = shallowRef<ProviderOffer[] | null>(null)
const providersError = shallowRef<unknown>(null)
async function loadProviders() {
  providersError.value = null
  try {
    providers.value = (await runtime.models()).data.own_key?.providers ?? []
  } catch (e) {
    providersError.value = e
  }
}
void loadProviders()

function onPlan(p: SchoolPlan) {
  plan.data.value = p
}
</script>

<template>
  <div class="school-plan">
    <section v-if="!plan.data.value" class="app-card school-plan__state">
      <RuntimeAsync :loading="plan.loading.value" :error="plan.error.value" @retry="plan.reload" />
    </section>
    <template v-else>
      <el-alert
        v-if="plan.error.value"
        type="warning"
        :closable="false"
        show-icon
        :title="t('runtimeAdmin.state.reloadFailed')"
        class="school-plan__stale"
      />
      <OffersCard
        :plan="plan.data.value"
        :providers="providers"
        :providers-error="providersError"
        :refreshing="plan.loading.value"
        @changed="plan.reload"
        @reload-providers="loadProviders"
      />
      <QuotasCard :plan="plan.data.value" @update="onPlan" />
    </template>
  </div>
</template>

<style scoped>
.school-plan__stale {
  margin-bottom: 16px;
}
</style>
