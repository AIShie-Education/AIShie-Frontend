<script setup lang="ts">
// An agent the school's runtime hosts (the contract's §9.4): what it is
// doing and why (its status and problem), its model and key, its seats in
// sentences built from the runtime's facts, today's answers and cost (on
// the school's plan: the plan's label in place of a key, the owner's use of
// the plan today against its quota, and whether their own key stands
// behind it; the school pays, so no cost is shown), and
// what the owner can do: choose or change the model and key (F3), connect
// it again when the token the runtime held was revoked in Core
// (needs_token: the runtime is issued a new one, POST …/token), pause or
// resume it (on the runtime only: this is not Core's Suspend; pausing
// revokes its token, so nobody can ask it on the site meanwhile), and delete
// it from the runtime. No token is shown or handled here. It is read again
// every few seconds while it starts, and every half minute otherwise, not
// while the page is hidden.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElNotification } from 'element-plus'
import { isRuntimeError, isVersionMismatch, runtime } from '@/api/runtime'
import type { HostedAgent, ProviderOffer } from '@/api/runtime-types'
import { usePolling } from '@/composables/usePolling'
import DailyReset from '@/components/DailyReset.vue'
import TimeText from '@/components/TimeText.vue'
import DeleteHostingDialog from './DeleteHostingDialog.vue'
import {
  STATUS_TAG,
  hostingErrorText,
  isTransitional,
  pollInterval,
  providerLabel,
  revocationNotice,
  schoolSpent,
  seatSentences,
} from './hosting'
import type { AgentStanding } from './agents'
import { joinParts } from '@/utils/parts'
import { formatMoney } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    agent: HostedAgent
    actorId: string
    name: string
    /** Core's standing of the agent: a suspended one is not connected again. */
    standing?: AgentStanding
    /** GET /models' providers, for their names; the provider's id stands in without them. */
    offers?: ProviderOffer[] | null
    /** The runtime hosts by an agent's id, and so connects it again (features.host_by_id). */
    canRenew?: boolean
    /** The runtime takes a model and key of the owner's (features.own_key). */
    canChooseModel?: boolean
    /** The runtime offers the school's plan (features.school_key). */
    canChooseSchool?: boolean
  }>(),
  {
    standing: 'active',
    offers: null,
    canRenew: true,
    canChooseModel: true,
    canChooseSchool: false,
  },
)
const emit = defineEmits<{
  update: [agent: HostedAgent]
  /** No longer on the runtime (deleted here, or elsewhere). */
  deleted: []
  chooseModel: []
  /** What Core says of the agent changed (whether it can be asked on the site): read it again. */
  changed: []
}>()
const { t } = useI18n()

const status = computed(() => props.agent.status)
const problem = computed(() => props.agent.problem)
const own = computed(() => props.agent.model.own)
const school = computed(() => props.agent.model.school ?? null)
const schoolUse = computed(() => props.agent.today.school ?? null)
/** A model and key, or the school's plan, may be chosen here. */
const canChoose = computed(() => props.canChooseModel || props.canChooseSchool)
const busy = ref<'pause' | 'resume' | 'renew' | null>(null)
const error = shallowRef<unknown>(null)
const deleteOpen = ref(false)
const active = computed(() => (props.standing ?? 'active') === 'active')

// --- What it is doing ----------------------------------------------------------------
const statusTitle = computed(() => t(`hosting.status.${status.value}.title`))
const statusBody = computed(() => {
  const p = problem.value
  if (status.value === 'error' && p) return t(`hosting.problem.${p.reason}`, { detail: p.detail })
  if (status.value === 'needs_model' && props.canChooseSchool) return t('hosting.status.needs_model.bodySchool')
  return t(`hosting.status.${status.value}.body`)
})
const ownLine = computed(() =>
  own.value ? joinParts([providerLabel(props.offers, own.value.provider), own.value.model]) : '',
)
const modelLine = computed(() => (school.value ? school.value.label : ownLine.value))
/** The model's id beside the plan's label, unless the label says it already. */
const schoolModel = computed(() => {
  const s = school.value
  return s && s.model && !s.label.includes(s.model) ? s.model : ''
})
const spent = computed(() => schoolSpent(schoolUse.value))
/**
 * The school withdrew the offer (turned off, deleted, or no longer allowed):
 * said beside the facts, as its own model goes on answering where one stands
 * behind it; where none does, the status's problem (offer_withdrawn) says it.
 */
const withdrawn = computed<'fallback' | 'none' | null>(() => {
  const s = school.value
  if (!s || s.offered) return null
  if (s.fallback && own.value) return 'fallback'
  return problem.value?.reason === 'offer_withdrawn' ? null : 'none'
})
const seats = computed(() => props.agent.seats ?? [])
const cost = computed(() =>
  own.value && !own.value.price_known ? t('hosting.card.costUnknown') : formatMoney(props.agent.today.cost_usd),
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

// --- Pause, resume, and a new token ------------------------------------------------------
// Sent without a version (§9.1). Should the runtime all the same answer 412,
// the agent changed meanwhile: it is read again, and the owner told. Pausing
// revokes the agent's token in Core: when that failed, the owner is told,
// since people may still be offered to ask it (pausing again tries again).
async function pause() {
  busy.value = 'pause'
  error.value = null
  try {
    const { revocation, ...agent } = (await runtime.pause(props.agent.id)).data
    emit('update', agent)
    const notice = revocationNotice(revocation, 'pause', t)
    if (notice)
      ElNotification({ type: 'warning', title: t('hosting.card.paused'), message: notice, duration: 0 })
    else ElMessage({ type: 'success', message: t('hosting.card.paused') })
  } catch (e) {
    await onError(e)
  } finally {
    busy.value = null
    emit('changed')
  }
}

async function resume() {
  busy.value = 'resume'
  error.value = null
  try {
    emit('update', (await runtime.resume(props.agent.id)).data)
    ElMessage({ type: 'success', message: t('hosting.card.resumed') })
  } catch (e) {
    await onError(e)
  } finally {
    busy.value = null
    emit('changed')
  }
}

/** Connects it again after its token was revoked in Core: the runtime is issued a new one. */
async function renew() {
  busy.value = 'renew'
  error.value = null
  try {
    emit('update', (await runtime.renewToken(props.agent.id)).data)
    ElMessage({ type: 'success', message: t('hosting.card.renewed', { name: props.name }) })
  } catch (e) {
    await onError(e)
  } finally {
    busy.value = null
    emit('changed')
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
// None where the runtime does not offer it (a feature false in GET /info).
type Primary = 'chooseModel' | 'reconnect' | 'changeModel'
const primary = computed<Primary | null>(() => {
  if (status.value === 'needs_token') return props.canRenew ? 'reconnect' : null
  if (!canChoose.value) return null
  return status.value === 'needs_model' ? 'chooseModel' : 'changeModel'
})
function onPrimary() {
  if (primary.value === 'reconnect') void renew()
  else emit('chooseModel')
}
function onCommand(cmd: string) {
  if (cmd === 'delete') deleteOpen.value = true
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
      <dd class="hosted-card__model">
        {{ modelLine || t('hosting.card.noModel') }}
        <span v-if="schoolModel" class="app-muted hosted-card__model-id">{{ schoolModel }}</span>
      </dd>
      <template v-if="school">
        <dt>{{ t('hosting.card.plan') }}</dt>
        <dd class="hosted-card__plan">{{ t('hosting.card.schoolPlan') }}</dd>
        <dt>{{ t('hosting.card.fallback') }}</dt>
        <dd class="hosted-card__fallback">
          <template v-if="school.fallback && own">
            {{ ownLine
            }}<template v-if="agent.own_key"
              >, <code>{{ agent.own_key.hint }}</code></template
            >
          </template>
          <span v-else class="app-muted">{{ t('hosting.card.fallbackNone') }}</span>
        </dd>
      </template>
      <template v-else-if="agent.own_key">
        <dt>{{ t('hosting.card.key') }}</dt>
        <dd>
          <code>{{ agent.own_key.hint }}</code>
        </dd>
      </template>
      <template v-if="school && schoolUse">
        <dt>{{ t('hosting.card.schoolAllowance') }}</dt>
        <dd class="hosted-card__today hosted-card__school-use">
          <span class="hosted-card__school-count" :class="{ 'is-spent': spent }">
            {{ t('hosting.card.todaySchool', { used: schoolUse.used, limit: schoolUse.limit }) }}
          </span>
          <i18n-t
            keypath="hosting.card.todaySchoolHint"
            tag="span"
            scope="global"
            class="app-muted hosted-card__school-hint"
          >
            <template #reset><DailyReset :since="agent.today.since" /></template>
          </i18n-t>
          <span class="app-muted hosted-card__per-asker">{{
            t('hosting.card.perAsker', { n: schoolUse.per_asker_limit })
          }}</span>
        </dd>
        <dt>{{ t('hosting.card.thisAgent') }}</dt>
        <dd class="hosted-card__agent-today">
          {{ t('hosting.card.answers', { n: agent.today.answers }, agent.today.answers) }}
        </dd>
      </template>
      <template v-else>
        <dt>{{ t('hosting.card.today') }}</dt>
        <dd class="hosted-card__today">
          {{ t('hosting.card.answers', { n: agent.today.answers }, agent.today.answers) }},
          {{ cost }}
        </dd>
      </template>
    </dl>
    <el-alert
      v-if="school && spent"
      type="warning"
      :closable="false"
      show-icon
      class="hosted-card__alert hosted-card__spent"
    >
      <template #title>
        <i18n-t :keypath="school.fallback ? 'hosting.card.spentFallback' : 'hosting.card.spentNone'" scope="global">
          <template #reset><DailyReset :since="agent.today.since" /></template>
        </i18n-t>
      </template>
    </el-alert>
    <el-alert
      v-if="withdrawn"
      type="warning"
      :closable="false"
      show-icon
      :title="t(withdrawn === 'fallback' ? 'hosting.card.offerWithdrawnFallback' : 'hosting.card.offerWithdrawn')"
      class="hosted-card__alert hosted-card__withdrawn"
    />
    <p v-if="agent.proposals_waiting > 0" class="hosted-card__proposals">
      {{ t('hosting.card.proposals', { n: agent.proposals_waiting }, agent.proposals_waiting) }}
    </p>

    <h3 class="hosted-card__h">{{ t('hosting.card.seats') }}</h3>
    <ul v-if="seats.length" class="hosted-card__seats">
      <li v-for="s in seats" :key="s.course_id" class="hosted-card__seat">
        <span class="hosted-card__course"
          >{{ s.course_code }}<template v-if="s.section"><span class="app-sep">·</span>{{ s.section }}</template>
          <span class="app-muted">{{ s.course_title }}</span></span
        >
        <span v-for="(line, i) in seatSentences(s, t)" :key="i" class="hosted-card__line">{{ line }}</span>
      </li>
    </ul>
    <p v-else class="app-form-hint">{{ t('hosting.seat.none') }}</p>

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="errorText" class="hosted-card__alert" />

    <p v-if="!canChoose" class="app-form-hint hosted-card__off">{{ t('hosting.card.ownKeyOff') }}</p>
    <p v-if="!canRenew && status === 'needs_token'" class="app-form-hint hosted-card__off">
      {{ t('hosting.card.renewOff') }}
    </p>

    <div class="hosted-card__actions">
      <el-tooltip
        v-if="primary"
        :disabled="primary !== 'reconnect' || active"
        :content="t('hosting.offer.hostSuspended')"
        placement="top"
      >
        <span>
          <el-button
            type="primary"
            class="hosted-card__primary"
            :disabled="primary === 'reconnect' && !active"
            :loading="busy === 'renew'"
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
            <el-dropdown-item command="delete">{{ t('hosting.card.delete') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <DeleteHostingDialog
      v-model="deleteOpen"
      :name="name"
      :agent="agent"
      @deleted="emit('deleted')"
      @changed="emit('update', $event)"
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
.hosted-card__model-id {
  margin-left: 6px;
  font-size: 12px;
}
.hosted-card__school-use {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hosted-card__school-count {
  font-weight: 600;
}
.hosted-card__school-count.is-spent {
  color: var(--el-color-warning-dark-2);
}
.hosted-card__school-hint,
.hosted-card__per-asker {
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
.hosted-card__off {
  margin: 8px 0 0;
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
</style>
