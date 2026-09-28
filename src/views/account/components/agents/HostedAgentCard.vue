<script setup lang="ts">
// An agent the school's runtime hosts (the contract's §9.4): what it is
// doing and why (its status and problem), its model and key, its seats in
// sentences built from the runtime's facts, today's answers and cost, and
// what the owner can do: choose or change the model and key (F3), give it a
// new token, pause or resume it (on the runtime only: this is not Core's
// Suspend), and delete it from the runtime. It is read again every few
// seconds while it starts, and every half minute otherwise, not while the
// page is hidden.
//
// An agent has one brain at a time. While the runtime hosts it, the other
// two ways to run it (another AI tool, or an AIShie runtime of one's own)
// are folded away, with a note that they apply only once hosting is
// deleted; resuming while another of its tokens is in use says so first.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/api/http'
import { isRuntimeError, isVersionMismatch, runtime } from '@/api/runtime'
import type { HostedAgent, ProviderOffer } from '@/api/runtime-types'
import type { AgentCredential } from '@/api/types'
import { usePolling } from '@/composables/usePolling'
import TimeText from '@/components/TimeText.vue'
import ConnectToolSteps from './ConnectToolSteps.vue'
import DeleteHostingDialog from './DeleteHostingDialog.vue'
import OwnRuntimeSteps from './OwnRuntimeSteps.vue'
import {
  STATUS_TAG,
  courseLabel,
  hostingErrorText,
  isTransitional,
  otherRecentTokens,
  pollInterval,
  providerLabel,
  seatSentences,
  type UnrevokedToken,
} from './hosting'
import { revokeAllAsOwner } from './hostingFlow'
import type { AgentStanding } from './agents'

const props = defineProps<{
  agent: HostedAgent
  actorId: string
  name: string
  credentials?: AgentCredential[] | null
  /** Core's standing of the agent: a suspended one cannot be given a token. */
  standing?: AgentStanding
  /** GET /models' providers, for their names; the provider's id stands in without them. */
  offers?: ProviderOffer[] | null
}>()
const emit = defineEmits<{
  update: [agent: HostedAgent]
  /** No longer on the runtime (deleted here, or elsewhere). */
  deleted: []
  chooseModel: []
  /** Give it a new token: 'reconnect' when AIShie refused the one it had. */
  newToken: [mode: 'replace' | 'reconnect']
  credsChanged: []
  /** Deleting left its token working: the owner is offered to revoke it (§9.4). */
  unrevoked: [token: UnrevokedToken]
}>()
const { t } = useI18n()

const status = computed(() => props.agent.status)
const problem = computed(() => props.agent.problem)
const own = computed(() => props.agent.model.own)
const busy = ref<'pause' | 'resume' | null>(null)
const error = shallowRef<unknown>(null)
const deleteOpen = ref(false)
const active = computed(() => (props.standing ?? 'active') === 'active')

// --- What it is doing ----------------------------------------------------------------
const statusTitle = computed(() => t(`hosting.status.${status.value}.title`))
const statusBody = computed(() => {
  const p = problem.value
  if (status.value === 'error' && p) return t(`hosting.problem.${p.reason}`, { detail: p.detail })
  return t(`hosting.status.${status.value}.body`)
})
const modelLine = computed(() => (own.value ? `${providerLabel(props.offers, own.value.provider)} · ${own.value.model}` : ''))
const seats = computed(() => props.agent.seats ?? [])
const cost = computed(() =>
  own.value && !own.value.price_known ? t('hosting.card.costUnknown') : `$${props.agent.today.cost_usd}`,
)

// --- Keeping it fresh ------------------------------------------------------------------
// The wait is worked out afresh before each look (usePolling reads intervalMs
// each time): 3 s while starting or restarting, 15 s once that has gone on for
// two minutes, and 30 s otherwise.
let transitionalSince: number | null = null
const polling = usePolling(
  async () => {
    try {
      emit('update', (await runtime.get(props.agent.id)).data)
    } catch (e) {
      if (isRuntimeError(e) && e.reason === 'agent_not_found') {
        ElMessage({ type: 'info', message: hostingErrorText(e, t) })
        emit('deleted')
        return
      }
      throw e
    }
  },
  {
    get intervalMs() {
      return pollInterval(status.value, transitionalSince === null ? 0 : Date.now() - transitionalSince)
    },
    immediate: false,
  },
)
watch(
  status,
  (s, before) => {
    if (!isTransitional(s)) transitionalSince = null
    else if (transitionalSince === null) transitionalSince = Date.now()
    // A new status sets a new pace: wait by it from now.
    if (before !== undefined && s !== before) {
      polling.stop()
      polling.start()
    }
  },
  { immediate: true },
)

// --- Pause and resume ------------------------------------------------------------------
// Sent without a version (§9.1). Should the runtime all the same answer 412,
// the agent changed meanwhile: it is read again, and the owner told.
async function pause() {
  busy.value = 'pause'
  error.value = null
  try {
    emit('update', (await runtime.pause(props.agent.id)).data)
    ElMessage({ type: 'success', message: t('hosting.card.paused') })
  } catch (e) {
    await onError(e)
  } finally {
    busy.value = null
  }
}

async function resume() {
  // Resuming starts hosting again: not while something else runs the agent, unless the owner says so.
  const others = otherRecentTokens(props.credentials, props.agent.token.prefix)
  if (others.length) {
    const choice = await ElMessageBox.confirm(t('hosting.oneBrain.body'), t('hosting.oneBrain.title'), {
      type: 'warning',
      distinguishCancelAndClose: true,
      confirmButtonText: t('hosting.oneBrain.revokeResume'),
      cancelButtonText: t('hosting.oneBrain.anywayResume'),
    }).then(
      () => 'revoke' as const,
      (action: unknown) => (action === 'cancel' ? ('anyway' as const) : null),
    )
    if (!choice) return
    if (choice === 'revoke') {
      const failed = await revokeAllAsOwner(
        props.actorId,
        others.map((c) => c.id),
      )
      emit('credsChanged')
      if (failed) {
        error.value = new ApiError({ status: 0, code: 'revoke_failed', message: t('hosting.oneBrain.revokeFailed') })
        return
      }
    }
  }
  busy.value = 'resume'
  error.value = null
  try {
    emit('update', (await runtime.resume(props.agent.id)).data)
    ElMessage({ type: 'success', message: t('hosting.card.resumed') })
  } catch (e) {
    await onError(e)
  } finally {
    busy.value = null
  }
}

async function onError(e: unknown) {
  if (isRuntimeError(e) && e.reason === 'agent_not_found') {
    ElMessage({ type: 'info', message: hostingErrorText(e, t) })
    emit('deleted')
    return
  }
  error.value = e
  // Changed meanwhile (412): read it again, and show it as it is now.
  if (isVersionMismatch(e)) await reread()
}

/** Reads the agent again after a write found it changed; a hosting gone meanwhile is gone. */
async function reread() {
  try {
    emit('update', (await runtime.get(props.agent.id)).data)
  } catch (again) {
    if (isRuntimeError(again) && again.reason === 'agent_not_found') return onError(again)
  }
}

const errorText = computed(() => {
  if (!error.value) return ''
  if (isVersionMismatch(error.value)) return t('hosting.errors.changedMeanwhile')
  return hostingErrorText(error.value, t)
})

// --- The primary action, by status ------------------------------------------------------
type Primary = 'chooseModel' | 'reconnect' | 'changeModel'
const primary = computed<Primary>(() => {
  if (status.value === 'needs_model') return 'chooseModel'
  if (status.value === 'needs_token') return 'reconnect'
  return 'changeModel'
})
function onPrimary() {
  if (primary.value === 'reconnect') emit('newToken', 'reconnect')
  else emit('chooseModel')
}
function onCommand(cmd: string) {
  if (cmd === 'replace') emit('newToken', 'replace')
  else if (cmd === 'delete') deleteOpen.value = true
}
defineExpose({ onCommand })
</script>

<template>
  <section class="app-card hosted-card" :class="`is-${status}`">
    <h2 class="app-card__title hosted-card__title">
      <span>{{ t('hosting.card.title') }}</span>
      <el-tag :type="STATUS_TAG[status]" disable-transitions class="hosted-card__tag">{{ statusTitle }}</el-tag>
    </h2>

    <p class="hosted-card__status">{{ statusBody }}</p>
    <details v-if="problem" class="hosted-card__problem">
      <summary>{{ t('hosting.card.details') }}</summary>
      <p class="hosted-card__detail">{{ problem.detail }}</p>
      <p class="app-muted hosted-card__since">
        {{ t('hosting.card.since') }}
        <TimeText :value="problem.since" />
      </p>
    </details>

    <dl class="hosted-card__facts">
      <dt>{{ t('hosting.card.model') }}</dt>
      <dd class="hosted-card__model">{{ modelLine || t('hosting.card.noModel') }}</dd>
      <template v-if="agent.own_key">
        <dt>{{ t('hosting.card.key') }}</dt>
        <dd><code>{{ agent.own_key.hint }}</code></dd>
      </template>
      <dt>{{ t('hosting.card.token') }}</dt>
      <dd><code>{{ agent.token.hint }}</code></dd>
      <dt>{{ t('hosting.card.today') }}</dt>
      <dd class="hosted-card__today">
        {{ t('hosting.card.answers', { n: agent.today.answers }, agent.today.answers) }},
        {{ cost }}
      </dd>
    </dl>
    <p v-if="agent.proposals_waiting > 0" class="hosted-card__proposals">
      {{ t('hosting.card.proposals', { n: agent.proposals_waiting }, agent.proposals_waiting) }}
    </p>

    <h3 class="hosted-card__h">{{ t('hosting.card.seats') }}</h3>
    <ul v-if="seats.length" class="hosted-card__seats">
      <li v-for="s in seats" :key="s.course_id" class="hosted-card__seat">
        <span class="hosted-card__course">{{ courseLabel(s) }} <span class="app-muted">{{ s.course_title }}</span></span>
        <span v-for="(line, i) in seatSentences(s, t)" :key="i" class="hosted-card__line">{{ line }}</span>
      </li>
    </ul>
    <p v-else class="app-form-hint">{{ t('hosting.seat.none') }}</p>

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="hosted-card__alert" />

    <div class="hosted-card__actions">
      <el-tooltip :disabled="primary !== 'reconnect' || active" :content="t('hosting.choice.hostSuspended')" placement="top">
        <span>
          <el-button
            type="primary"
            class="hosted-card__primary"
            :disabled="primary === 'reconnect' && !active"
            @click="onPrimary"
          >
            {{ t(`hosting.card.primary.${primary}`) }}
          </el-button>
        </span>
      </el-tooltip>
      <el-tooltip :content="t('hosting.card.pauseHint')" placement="top">
        <span>
          <el-button v-if="agent.paused" class="hosted-card__resume" :loading="busy === 'resume'" @click="resume">
            {{ t('hosting.card.resume') }}
          </el-button>
          <el-button v-else class="hosted-card__pause" :loading="busy === 'pause'" @click="pause">
            {{ t('hosting.card.pause') }}
          </el-button>
        </span>
      </el-tooltip>
      <el-dropdown trigger="click" class="hosted-card__more" @command="onCommand">
        <el-button>
          <span>{{ t('hosting.card.more') }}</span>
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="replace" :disabled="!active">{{ t('hosting.card.replaceToken') }}</el-dropdown-item>
            <el-dropdown-item command="delete" divided>{{ t('hosting.card.delete') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <details class="hosted-card__self">
      <summary>{{ t('hosting.choice.selfWhileHosted') }}</summary>
      <el-alert type="info" :closable="false" show-icon :title="t('hosting.choice.selfWhileHostedNote')" class="hosted-card__self-note" />
      <h4 class="hosted-card__self-h">{{ t('hosting.choice.tool') }}</h4>
      <ConnectToolSteps />
      <h4 class="hosted-card__self-h">{{ t('hosting.choice.runtime') }}</h4>
      <OwnRuntimeSteps :name="name" :actor-id="actorId" />
    </details>

    <DeleteHostingDialog
      v-model="deleteOpen"
      :actor-id="actorId"
      :name="name"
      :agent="agent"
      :credentials="credentials"
      @deleted="emit('deleted')"
      @changed="emit('update', $event)"
      @unrevoked="emit('unrevoked', $event)"
    />
  </section>
</template>

<style scoped>
.hosted-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.hosted-card.is-running {
  border-color: var(--el-color-success-light-5);
}
.hosted-card__status {
  margin: -4px 0 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.hosted-card__problem {
  margin-bottom: 8px;
  font-size: 13px;
}
.hosted-card__problem summary {
  cursor: pointer;
  color: var(--el-color-primary);
}
.hosted-card__detail {
  margin: 4px 0 0;
  word-break: break-word;
}
.hosted-card__since {
  margin: 4px 0 0;
  font-size: 12px;
}
.hosted-card__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 12px 0 0;
  font-size: 13px;
}
.hosted-card__facts dt {
  color: var(--el-text-color-secondary);
}
.hosted-card__facts dd {
  margin: 0;
  min-width: 0;
  word-break: break-word;
}
.hosted-card__facts code {
  font-family: var(--app-font-mono);
  font-size: 12px;
}
.hosted-card__proposals {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-color-warning-dark-2);
}
.hosted-card__h {
  margin: 16px 0 6px;
  font-size: 14px;
  font-weight: 600;
}
.hosted-card__seats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.hosted-card__seat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hosted-card__course {
  font-weight: 500;
}
.hosted-card__alert {
  margin-top: 12px;
}
.hosted-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.hosted-card__actions .el-button + .el-button {
  margin-left: 0;
}
.hosted-card__self {
  margin-top: 16px;
  font-size: 13px;
}
.hosted-card__self summary {
  cursor: pointer;
  color: var(--el-color-primary);
}
.hosted-card__self-note {
  margin: 10px 0;
}
.hosted-card__self-h {
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
}
</style>
