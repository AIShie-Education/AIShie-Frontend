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
//
// What the runtime offers, it says in GET /info's features, each true or
// false: connect_by_token for connecting an agent by its token (the wizard,
// pasting, and a new token for a hosted one), own_key for a model and key of
// the owner's, school_key for the school's plan (D8), a model the school
// provides and pays for. Each entry point shows only while its feature is
// true. Hosting an agent not hosted yet needs connect_by_token and a way to
// give it a model, own_key or school_key, since a hosted agent without a
// model never runs. An agent hosted already shows as hosted whatever the
// features say.
//
// Connecting answers with the agent's other live tokens (the contract's
// A.1). When one was used lately, or others still work, the panel says so
// above the hosted card, and in the model step too, since the agent starts
// answering once it has a model: something else may be running it, and an
// agent has one brain at a time. Each of those tokens can be revoked there.
//
// When replacing the agent's token or deleting its hosting left the old
// token working (the runtime could not revoke it), the panel says so above
// whatever card follows, and offers the owner to revoke it (§9.4).
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isRuntimeError, runtime } from '@/api/runtime'
import type { HostedAgent, OtherTokens, ProviderOffer } from '@/api/runtime-types'
import type { AgentCredential, AgentFull } from '@/api/types'
import { useRuntime } from '@/composables/useRuntime'
import ConnectRuntimeCard from './ConnectRuntimeCard.vue'
import HostedAgentCard from './HostedAgentCard.vue'
import HostOnRuntimeDialog from './HostOnRuntimeDialog.vue'
import ModelKeyDialog from './ModelKeyDialog.vue'
import OtherTokensNotice from './OtherTokensNotice.vue'
import PasteTokenDialog from './PasteTokenDialog.vue'
import UnrevokedTokenNotice from './UnrevokedTokenNotice.vue'
import type { AgentStanding, SetupProgress } from './agents'
import { hostingErrorText, withoutTokens, type HostMode, type UnrevokedToken } from './hosting'

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
const features = computed(() => rt.info.value?.features ?? null)
/** Agents are connected by their token: the wizard, pasting one, and a new token for a hosted one. */
const canConnect = computed(() => !!features.value?.connect_by_token)
/** A model and a key of the owner's: the model step, and changing them. */
const canChooseModel = computed(() => !!features.value?.own_key)
/** The school's plan: a model the school provides and pays for. */
const canChooseSchool = computed(() => !!features.value?.school_key)
/** A model may be given: the owner's own, or the school's plan. */
const canGiveModel = computed(() => canChooseModel.value || canChooseSchool.value)
/** Hosting is offered to an agent not hosted yet. */
const offerHosting = computed(() => canConnect.value && canGiveModel.value)
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
// --- The agent's other tokens, as connecting found them ------------------------------------
/** Shown after connecting while any are listed; null once put away, or when there are none to show. */
const afterConnect = shallowRef<OtherTokens | null>(null)
function onOtherRevoked(prefix: string) {
  const left = withoutTokens(afterConnect.value, [prefix])
  afterConnect.value = left?.tokens.length ? left : null
}

// --- Tokens the runtime could not revoke --------------------------------------------------
/** Each shown until the owner revokes it, or puts it aside. */
const leftovers = shallowRef<UnrevokedToken[]>([])
function onUnrevoked(u: UnrevokedToken) {
  leftovers.value = [...leftovers.value.filter((x) => x.prefix !== u.prefix), u]
}
function onLeftoverDone(prefix: string) {
  leftovers.value = leftovers.value.filter((x) => x.prefix !== prefix)
}

function onConnected(a: HostedAgent, others: OtherTokens | null | undefined) {
  hosted.value = a
  afterConnect.value = others?.tokens.length ? others : null
  emit('credsChanged')
  // Step two: the model and key, or the school's plan, with the card behind it.
  if (!canGiveModel.value) return
  modelWizard.value = true
  modelOpen.value = true
}
function chooseModel() {
  modelWizard.value = false
  modelOpen.value = true
}
function onDeleted() {
  hosted.value = null
  afterConnect.value = null
  emit('credsChanged')
  void load()
}
</script>

<template>
  <!-- A column of the agent's page: its notices, then its card, which grows to the column's end. -->
  <div class="hosting-panel app-column">
    <UnrevokedTokenNotice
      v-for="u in leftovers"
      :key="u.prefix"
      :actor-id="agent.actor_id"
      :token="u"
      :held="hosted?.token.prefix ?? null"
      class="hosting-panel__notice hosting-panel__unrevoked"
      @done="onLeftoverDone(u.prefix)"
      @creds-changed="emit('credsChanged')"
    />
    <OtherTokensNotice
      v-if="hosted && afterConnect"
      :actor-id="agent.actor_id"
      :others="afterConnect"
      closable
      class="hosting-panel__notice hosting-panel__others"
      @revoked="onOtherRevoked"
      @creds-changed="emit('credsChanged')"
      @close="afterConnect = null"
    />

    <section v-if="!rt.checked.value" v-loading="true" class="app-card hosting-panel__checking" />

    <HostedAgentCard
      v-else-if="rt.available.value && hosted"
      :agent="hosted"
      :actor-id="agent.actor_id"
      :name="agent.display_name"
      :credentials="credentials"
      :standing="standing"
      :offers="offers"
      :can-connect="canConnect"
      :can-choose-model="canChooseModel"
      :can-choose-school="canChooseSchool"
      @update="hosted = $event"
      @deleted="onDeleted"
      @choose-model="chooseModel"
      @new-token="onNewToken"
      @creds-changed="emit('credsChanged')"
      @unrevoked="onUnrevoked"
    />

    <ConnectRuntimeCard
      v-else
      :hosting="rt.available.value && offerHosting"
      :school="canChooseSchool"
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
          <p class="hosting-offer__intro">
            {{ t(canChooseSchool ? 'hosting.choice.hostedIntroSchool' : 'hosting.choice.hostedIntro') }}
          </p>
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

    <template v-if="rt.available.value">
      <HostOnRuntimeDialog
        v-if="canConnect"
        v-model="hostOpen"
        :mode="hostMode"
        :actor-id="agent.actor_id"
        :name="agent.display_name"
        :seats="agent.seats"
        :credentials="credentials"
        :hosted="hosted"
        :school="canChooseSchool"
        @connected="onConnected"
        @replaced="hosted = $event"
        @unrevoked="onUnrevoked"
        @refresh="load"
        @creds-changed="emit('credsChanged')"
      />
      <PasteTokenDialog
        v-if="canConnect"
        v-model="pasteOpen"
        :actor-id="agent.actor_id"
        :name="agent.display_name"
        :credentials="credentials"
        @connected="onConnected"
        @refresh="load"
        @creds-changed="emit('credsChanged')"
      />
      <ModelKeyDialog
        v-if="hosted && canGiveModel"
        v-model="modelOpen"
        :agent-id="hosted.id"
        :name="agent.display_name"
        :wizard="modelWizard"
        :own-key="canChooseModel"
        :school-key="canChooseSchool"
        @saved="hosted = $event"
      >
        <template #notice>
          <OtherTokensNotice
            v-if="modelWizard && afterConnect"
            :actor-id="agent.actor_id"
            :others="afterConnect"
            class="hosting-panel__model-notice"
            @revoked="onOtherRevoked"
            @creds-changed="emit('credsChanged')"
          />
        </template>
      </ModelKeyDialog>
    </template>
  </div>
</template>

<style scoped>
.hosting-panel__model-notice {
  margin-bottom: 12px;
}
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
