<script setup lang="ts">
// How an agent hosted on AIshie runs, on its page (the contract's §9.2, and
// runtime-hosting-api.md): the site's agent runtime runs it, by its id, and
// alone is issued its token; its owner never handles one. An agent with MCP
// access has no such panel (McpAccessCard): it is never hosted here.
//
// Hosting shows only where the runtime's API is there (useRuntime): until it
// has answered, a placeholder; where it is not, the card says so, since the
// agent cannot run without it. Where it is, the runtime's list says whether
// this agent is hosted: if so, the hosted card (HostedAgentCard); if not,
// the card offers to host it: the wizard's first step (HostOnRuntimeDialog,
// with this agent), then its model and key (ModelKeyDialog). After hosting
// from My agents, the page opens on the second step (?host=model).
//
// What the runtime offers, it says in GET /info's features, each true or
// false: host_by_id for hosting an agent by its id (and a new token for a
// hosted one whose token was revoked), own_key for a model and key of the
// owner's, school_key for the school's plan (D8). Hosting an agent not
// hosted yet needs host_by_id and a way to give it a model, own_key or
// school_key, since a hosted agent without a model never runs. An agent
// hosted already shows as hosted whatever the features say.
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { isRuntimeError, runtime } from '@/api/runtime'
import type { HostedAgent, ProviderOffer } from '@/api/runtime-types'
import type { AgentFull } from '@/api/types'
import { useRuntime } from '@/composables/useRuntime'
import HostedAgentCard from './HostedAgentCard.vue'
import HostOnRuntimeDialog from './HostOnRuntimeDialog.vue'
import ModelKeyDialog from './ModelKeyDialog.vue'
import type { AgentStanding } from './agents'
import { hostingErrorText } from './hosting'

const props = defineProps<{
  agent: AgentFull
  standing: AgentStanding
}>()
const emit = defineEmits<{
  bring: []
  /** What Core says of the agent may have changed (whether it can be asked on the site): read it again. */
  changed: []
}>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const rt = useRuntime()
const features = computed(() => rt.info.value?.features ?? null)
/** Agents are hosted by their id, and a hosted one whose token was revoked is connected again. */
const canHostById = computed(() => !!features.value?.host_by_id)
/** A model and a key of the owner's: the model step, and changing them. */
const canChooseModel = computed(() => !!features.value?.own_key)
/** The school's plan: a model the school provides and pays for. */
const canChooseSchool = computed(() => !!features.value?.school_key)
/** A model may be given: the owner's own, or the school's plan. */
const canGiveModel = computed(() => canChooseModel.value || canChooseSchool.value)
const actorId = computed(() => props.agent.actor_id.toLowerCase())
const active = computed(() => props.standing === 'active')
/** Why hosting is not offered now, as a message key; null when it is. */
const offerBlocked = computed<string | null>(() => {
  if (!canHostById.value) return 'hosting.offer.notById'
  if (!canGiveModel.value) return 'hosting.offer.noModel'
  return null
})

const hosted = shallowRef<HostedAgent | null>(null)
const listed = ref(false)
const loadError = shallowRef<unknown>(null)
const offers = shallowRef<ProviderOffer[] | null>(null)

let generation = 0
async function load() {
  const g = ++generation
  loadError.value = null
  if (!rt.available.value) {
    hosted.value = null
    listed.value = false
    return
  }
  try {
    const r = await runtime.list()
    if (g !== generation) return
    hosted.value = r.data.agents.find((a) => a.core_actor_id.toLowerCase() === actorId.value) ?? null
  } catch (e) {
    if (g !== generation) return
    hosted.value = null
    loadError.value = e
  } finally {
    if (g === generation) listed.value = true
  }
}
watch([() => rt.available.value, actorId], () => void load(), { immediate: true })

// The providers' names, for the card's model line: asked once, and not missed if they never come.
watch(
  () => !!hosted.value,
  (h) => {
    if (!h || offers.value) return
    runtime.models().then(
      (r) => (offers.value = r.data.own_key?.providers ?? []),
      () => undefined,
    )
  },
  { immediate: true },
)

const accountRefused = computed(() => isRuntimeError(loadError.value) && loadError.value.reason === 'account_refused')

// --- Dialogs -------------------------------------------------------------------------------
const hostOpen = ref(false)
const modelOpen = ref(false)
const modelWizard = ref(false)

function onHosted(a: HostedAgent) {
  hosted.value = a
  emit('changed')
  openModelStep()
}
/** Step two: the model and key, or the school's plan, with the card behind it. */
function openModelStep() {
  if (!canGiveModel.value) return
  modelWizard.value = true
  modelOpen.value = true
}
/** Its model chosen, the runtime runs it, and is issued its token: whether it can be asked changes. */
function onSaved(a: HostedAgent) {
  hosted.value = a
  emit('changed')
}
function chooseModel() {
  modelWizard.value = false
  modelOpen.value = true
}
function onDeleted() {
  hosted.value = null
  emit('changed')
  void load()
}

// Hosted from My agents: the page opens on the model step, once it knows the agent is hosted.
watch(
  [() => route.query.host, hosted],
  ([step, h]) => {
    if (step !== 'model' || !h) return
    void router.replace({ query: { ...route.query, host: undefined } })
    if (h.status === 'needs_model') openModelStep()
  },
  { immediate: true },
)
</script>

<template>
  <!-- A column of the agent's page: its card, which grows to the column's end. -->
  <div class="hosting-panel app-column">
    <section v-if="!rt.checked.value" v-loading="true" class="app-card hosting-panel__checking" />

    <HostedAgentCard
      v-else-if="rt.available.value && hosted"
      :agent="hosted"
      :actor-id="agent.actor_id"
      :name="agent.display_name"
      :standing="standing"
      :offers="offers"
      :can-renew="canHostById"
      :can-choose-model="canChooseModel"
      :can-choose-school="canChooseSchool"
      @update="hosted = $event"
      @deleted="onDeleted"
      @choose-model="chooseModel"
      @changed="emit('changed')"
    />

    <section v-else class="app-card hosting-offer">
      <h2 class="app-card__title hosting-offer__title">
        <span>{{ t('hosting.offer.title') }}</span>
        <AppTag tone="wait" size="default" class="hosting-offer__tag">
          {{ t('hosting.offer.notHosted') }}
        </AppTag>
      </h2>
      <el-alert
        v-if="!rt.available.value"
        type="warning"
        :closable="false"
        show-icon
        :title="t('hosting.offer.absent')"
        class="hosting-offer__unavailable"
      />
      <template v-else>
        <p class="hosting-offer__intro">
          {{ t(canChooseSchool ? 'hosting.offer.bodySchool' : 'hosting.offer.body') }}
        </p>
        <div v-if="!listed" v-loading="true" class="hosting-offer__loading" />
        <AppNote v-else-if="accountRefused" class="hosting-offer__unavailable">
          {{ t('hosting.unavailable.account') }}
        </AppNote>
        <el-alert
          v-else-if="loadError"
          type="error"
          :closable="false"
          show-icon
          :title="hostingErrorText(loadError, t)"
          class="hosting-offer__error"
        >
          <el-button size="small" @click="load">{{ t('common.actions.retry') }}</el-button>
        </el-alert>
        <el-alert
          v-else-if="offerBlocked"
          type="warning"
          :closable="false"
          show-icon
          :title="t(offerBlocked)"
          class="hosting-offer__unavailable"
        />
        <div v-else class="hosting-offer__actions">
          <el-tooltip :disabled="active" :content="t('hosting.offer.hostSuspended')" placement="top">
            <span>
              <el-button type="primary" class="hosting-offer__host" :disabled="!active" @click="hostOpen = true">
                {{ t('hosting.offer.host') }}
              </el-button>
            </span>
          </el-tooltip>
        </div>
      </template>
      <div v-if="!(agent.seats ?? []).length" class="hosting-offer__course">
        <span>{{ t('agents.connect.courseTodo') }}</span>
        <el-button type="primary" plain size="small" :disabled="!active" @click="emit('bring')">
          {{ t('agents.bring.open') }}
        </el-button>
      </div>
    </section>

    <template v-if="rt.available.value">
      <HostOnRuntimeDialog
        v-if="canHostById"
        v-model="hostOpen"
        :actor-id="agent.actor_id"
        :name="agent.display_name"
        :school="canChooseSchool"
        @hosted="onHosted"
      />
      <ModelKeyDialog
        v-if="hosted && canGiveModel"
        v-model="modelOpen"
        :agent-id="hosted.id"
        :name="agent.display_name"
        :wizard="modelWizard"
        :own-key="canChooseModel"
        :school-key="canChooseSchool"
        @saved="onSaved"
      />
    </template>
  </div>
</template>

<style scoped>
.hosting-panel__checking {
  min-height: 160px;
}
.hosting-offer__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.hosting-offer__intro {
  margin: -4px 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.hosting-offer__loading {
  min-height: 60px;
}
.hosting-offer__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.hosting-offer__course {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
