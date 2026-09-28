<script setup lang="ts">
// Where an agent runs, on its page (the contract's §9.2): hosted by AIShie
// on the school's runtime, or run by another AI tool or a runtime of the
// owner's. Hosting shows only where the runtime's API is there (useRuntime):
// until it has answered, a placeholder; where it is not, the card offers the
// other two alone, with no word of hosting and no error. Where it is, the
// runtime's list says whether this agent is hosted: if so, the hosted card;
// if not, the card offers all three, hosting first, by an issued token (the
// wizard) or a pasted one. After connecting comes the model and key (the
// wizard's second step).
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isRuntimeError, runtime } from '@/api/runtime'
import type { HostedAgent, ProviderOffer } from '@/api/runtime-types'
import type { AgentCredential, AgentFull } from '@/api/types'
import { useRuntime } from '@/composables/useRuntime'
import ConnectRuntimeCard from './ConnectRuntimeCard.vue'
import HostedAgentCard from './HostedAgentCard.vue'
import HostOnRuntimeDialog from './HostOnRuntimeDialog.vue'
import ModelKeyDialog from './ModelKeyDialog.vue'
import PasteTokenDialog from './PasteTokenDialog.vue'
import type { AgentStanding, SetupProgress } from './agents'
import { hostingErrorText, type HostMode } from './hosting'

const props = defineProps<{
  agent: AgentFull
  credentials?: AgentCredential[] | null
  progress: SetupProgress
  watching?: boolean
  standing: AgentStanding
}>()
const emit = defineEmits<{
  issue: []
  bring: []
  /** Core's list of the agent's tokens should be read again. */
  credsChanged: []
  /** The prefix of the token the runtime holds, or null when it is not hosted. */
  hosted: [prefix: string | null]
}>()
const { t } = useI18n()

const rt = useRuntime()
const canHost = computed(() => rt.available.value && (rt.info.value?.features.connect_by_token ?? false))
const actorId = computed(() => props.agent.actor_id.toLowerCase())
const active = computed(() => props.standing === 'active')

const hosted = shallowRef<HostedAgent | null>(null)
const listed = ref(false)
const loadError = shallowRef<unknown>(null)
const offers = shallowRef<ProviderOffer[] | null>(null)

let generation = 0
async function load() {
  const g = ++generation
  loadError.value = null
  if (!canHost.value) {
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
watch([canHost, actorId], () => void load(), { immediate: true })
watch(hosted, (h) => emit('hosted', h?.token.prefix ?? null), { immediate: true })

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
const hostMode = ref<HostMode>('connect')
const pasteOpen = ref(false)
const modelOpen = ref(false)
const modelWizard = ref(false)

function openHost() {
  hostMode.value = 'connect'
  hostOpen.value = true
}
function onNewToken(mode: 'replace' | 'reconnect') {
  hostMode.value = mode
  hostOpen.value = true
}
function onConnected(a: HostedAgent) {
  hosted.value = a
  emit('credsChanged')
  // Step two: the model and key, with the card behind it.
  modelWizard.value = true
  modelOpen.value = true
}
function chooseModel() {
  modelWizard.value = false
  modelOpen.value = true
}
function onDeleted() {
  hosted.value = null
  emit('credsChanged')
  void load()
}
</script>

<template>
  <section v-if="!rt.checked.value" v-loading="true" class="app-card hosting-panel__checking" />

  <ConnectRuntimeCard
    v-else-if="!canHost"
    :name="agent.display_name"
    :actor-id="agent.actor_id"
    :progress="progress"
    :last-seen-at="agent.last_seen_at"
    :seats="(agent.seats ?? []).length"
    :watching="watching"
    :disabled="!active"
    @issue="emit('issue')"
    @bring="emit('bring')"
  />

  <HostedAgentCard
    v-else-if="hosted"
    :agent="hosted"
    :actor-id="agent.actor_id"
    :name="agent.display_name"
    :credentials="credentials"
    :standing="standing"
    :offers="offers"
    @update="hosted = $event"
    @deleted="onDeleted"
    @choose-model="chooseModel"
    @new-token="onNewToken"
    @creds-changed="emit('credsChanged')"
  />

  <ConnectRuntimeCard
    v-else
    hosting
    :name="agent.display_name"
    :actor-id="agent.actor_id"
    :progress="progress"
    :last-seen-at="agent.last_seen_at"
    :seats="(agent.seats ?? []).length"
    :watching="watching"
    :disabled="!active"
    @issue="emit('issue')"
    @bring="emit('bring')"
  >
    <template #hosted>
      <div class="hosting-offer">
        <p class="hosting-offer__intro">{{ t('hosting.choice.hostedIntro') }}</p>
        <div v-if="!listed" v-loading="true" class="hosting-offer__loading" />
        <el-alert
          v-else-if="accountRefused"
          type="info"
          :closable="false"
          show-icon
          :title="t('hosting.unavailable.account')"
          class="hosting-offer__unavailable"
        />
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
        <div v-else class="hosting-offer__actions">
          <el-tooltip :disabled="active" :content="t('hosting.choice.hostSuspended')" placement="top">
            <span>
              <el-button type="primary" class="hosting-offer__host" :disabled="!active" @click="openHost">
                {{ t('hosting.choice.host') }}
              </el-button>
            </span>
          </el-tooltip>
          <el-button link type="primary" class="hosting-offer__paste" :disabled="!active" @click="pasteOpen = true">
            {{ t('hosting.choice.paste') }}
          </el-button>
        </div>
      </div>
    </template>
  </ConnectRuntimeCard>

  <template v-if="canHost">
    <HostOnRuntimeDialog
      v-model="hostOpen"
      :mode="hostMode"
      :actor-id="agent.actor_id"
      :name="agent.display_name"
      :seats="agent.seats"
      :credentials="credentials"
      :hosted="hosted"
      @connected="onConnected"
      @replaced="hosted = $event"
      @refresh="load"
      @creds-changed="emit('credsChanged')"
    />
    <PasteTokenDialog
      v-model="pasteOpen"
      :actor-id="agent.actor_id"
      :name="agent.display_name"
      :credentials="credentials"
      @connected="onConnected"
      @refresh="load"
      @creds-changed="emit('credsChanged')"
    />
    <ModelKeyDialog
      v-if="hosted"
      v-model="modelOpen"
      :agent-id="hosted.id"
      :name="agent.display_name"
      :wizard="modelWizard"
      @saved="hosted = $event"
    />
  </template>
</template>

<style scoped>
.hosting-panel__checking {
  min-height: 160px;
}
.hosting-offer__intro {
  margin: 0 0 12px;
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
</style>
