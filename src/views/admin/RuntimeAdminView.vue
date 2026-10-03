<script setup lang="ts">
// AI and documents: the school's agent runtime, as its administrators set it
// (the runtime's admin routes). The school's AI plan (the models the school
// provides and pays for, their keys, and the daily quotas), pricing and
// quotas (the price table, tenants' quotas, hosted agents' budgets, and what
// things cost), today's use of the plan, documents: the reading of scanned
// ones (OCR), and their text versions, written by a model of the plan (the
// transcriber), and agent hosting: the runtime's own credential for Core,
// the site service agent_runtime, by which it hosts agents by their ids.
//
// Platform administrators open it (router/modules/admin.ts), and the side bar
// offers it to them where there is a runtime. The runtime's own
// administrators are those of them its operator names (GET /me's is_admin):
// anyone else is told so. Where there is no runtime the page says so, and
// where it cannot be reached, offers to try again; a runtime older than a
// tab's routes says in that tab that it does not offer it yet, and the other
// tabs work.
//
// Each tab is a part the runtime answers for apart, loaded when first shown,
// and remembered in the address (?tab=): what comes next is one more entry,
// or one more card in its tab (as the transcriber is, beside OCR).
import { computed, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { runtime } from '@/api/runtime'
import { useAsync } from '@/composables/useAsync'
import { useRuntime } from '@/composables/useRuntime'
import PageHeader from '@/components/PageHeader.vue'
import OperatorDetail from './components/OperatorDetail.vue'
import AgentRuntimeCard from './runtime/AgentRuntimeCard.vue'
import DocumentsPanel from './runtime/DocumentsPanel.vue'
import PricingPanel from './runtime/PricingPanel.vue'
import RuntimeAsync from './runtime/RuntimeAsync.vue'
import SchoolPlanPanel from './runtime/SchoolPlanPanel.vue'
import UsageCard from './runtime/UsageCard.vue'
import { isUnreachable } from './runtime/runtimeAdmin'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const TABS: { name: string; label: string; component: Component }[] = [
  { name: 'plan', label: 'runtimeAdmin.tabs.plan', component: SchoolPlanPanel },
  { name: 'pricing', label: 'runtimeAdmin.tabs.pricing', component: PricingPanel },
  { name: 'usage', label: 'runtimeAdmin.tabs.usage', component: UsageCard },
  { name: 'documents', label: 'runtimeAdmin.tabs.documents', component: DocumentsPanel },
  { name: 'hosting', label: 'runtimeAdmin.tabs.hosting', component: AgentRuntimeCard },
]
const tab = computed({
  get: () => {
    const q = route.query.tab
    return typeof q === 'string' && TABS.some((x) => x.name === q) ? q : TABS[0].name
  },
  set: (v: string) => void router.replace({ query: { ...route.query, tab: v === TABS[0].name ? undefined : v } }),
})

const rt = useRuntime()
/** The runtime could be there, but did not answer as it: a gateway's error, or none at all. */
const unreachable = computed(() => isUnreachable(rt.error.value))
const me = useAsync(() => runtime.me().then((r) => r.data), { immediate: false })
watch(
  () => rt.available.value,
  (on) => {
    if (on) void me.reload()
  },
  { immediate: true },
)
</script>

<template>
  <div class="runtime-admin">
    <PageHeader :title="t('runtimeAdmin.title')" :subtitle="t('runtimeAdmin.subtitle')" />

    <section v-if="!rt.checked.value" v-loading="true" class="app-card runtime-admin__checking" />
    <section v-else-if="!rt.available.value" class="app-card runtime-admin__none">
      <el-result
        :icon="unreachable ? 'warning' : 'info'"
        :title="t(unreachable ? 'runtimeAdmin.state.unreachableTitle' : 'runtimeAdmin.state.absentTitle')"
        :sub-title="t(unreachable ? 'runtimeAdmin.state.unreachable' : 'runtimeAdmin.state.absent')"
      >
        <template v-if="unreachable" #extra>
          <el-button type="primary" class="runtime-admin__retry" @click="rt.refresh()">
            {{ t('common.actions.retry') }}
          </el-button>
        </template>
      </el-result>
    </section>
    <section v-else-if="!me.data.value" class="app-card runtime-admin__me">
      <RuntimeAsync :loading="me.loading.value || !me.error.value" :error="me.error.value" @retry="me.reload" />
    </section>
    <section v-else-if="!me.data.value.is_admin" class="app-card runtime-admin__not-admin">
      <el-result
        icon="warning"
        :title="t('runtimeAdmin.state.notAdminTitle')"
        :sub-title="t('runtimeAdmin.state.notAdmin')"
      >
        <template #extra><OperatorDetail :text="t('runtimeAdmin.flags.adminActorIds')" /></template>
      </el-result>
    </section>
    <el-tabs v-else v-model="tab" class="runtime-admin__tabs">
      <el-tab-pane v-for="x in TABS" :key="x.name" :name="x.name" :label="t(x.label)" lazy>
        <component :is="x.component" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
/* The page's own width decides its cards' layout, not the window's. */
.runtime-admin {
  container-type: inline-size;
}
.runtime-admin__checking {
  min-height: 160px;
}
.runtime-admin__tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
</style>
