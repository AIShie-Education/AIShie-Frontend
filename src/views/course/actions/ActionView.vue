<script setup lang="ts">
// One action in full (action.get): what was asked, who asked, at what level it
// was authorized, what became of it, who decided or reviewed it, and when.
// action.get needs action_decide, or owning the agent that did it; anyone else
// sees an action of their own from action.list_mine instead, which carries the
// same fields. Whether it is the caller's to decide is what the queue says of
// it (yours_to_decide): an agent's owner decides what it did where they could
// have done it themselves, and may take back what it proposed while it waits.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, read } from '@/api/http'
import type { ToolOut } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { announce, useWrite } from '@/composables/useWrite'
import { notifyError } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import { uuidPredecessor } from '@/views/admin/components/adminShared'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import JsonView from '@/components/JsonView.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActionActor from './components/ActionActor.vue'
import ActionTarget from './components/ActionTarget.vue'
import ActionTimeline from './components/ActionTimeline.vue'
import AnswerProposal from './components/AnswerProposal.vue'
import DecidePanel from './components/DecidePanel.vue'
import DelegateGrant from './components/DelegateGrant.vue'
import FieldsView from './components/FieldsView.vue'
import MaybeLink from './components/MaybeLink.vue'
import OutcomeAlert from './components/OutcomeAlert.vue'
import SeatGrant from './components/SeatGrant.vue'
import {
  invalidateAfter,
  isAboutAction,
  isObject,
  reasonText,
  routeFor,
  storedDecision,
  storedError,
  targetTypeLabel,
  typeLabel,
  useJudgeRules,
  type ActionRow,
} from './components/actionText'
import type { DecideResult, Done } from './components/decide'
import { refreshAfterDecision, useLookup, useSpecs } from './components/lookups'

const props = defineProps<{ courseId: string; actionId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const specs = useSpecs()
const rules = useJudgeRules()

const fromMine = ref(false)

async function load(): Promise<ActionRow> {
  // A decider reads any action; an agent's owner, their own agent's.
  if (course.can('action_decide') || course.ownsAgentHere !== false) {
    try {
      const a = await read('action.get', { course_id: props.courseId, action_id: props.actionId })
      fromMine.value = false
      return a
    } catch (e) {
      if (!(e instanceof ApiError && e.isForbidden)) throw e
    }
  }
  // Not a decider here: an action of one's own is in action.list_mine, which
  // lists by id after a cursor, so asking for the one after the id just
  // before this one finds it in a single call.
  const want = props.actionId.trim().toLowerCase()
  const after = uuidPredecessor(want)
  if (after) {
    const out = await read('action.list_mine', { course_id: props.courseId, after, limit: 1 })
    const found = out.actions?.[0]
    if (found && found.id.toLowerCase() === want) {
      fromMine.value = true
      return found
    }
  }
  throw new ApiError({ status: 403, code: 'forbidden', message: t('actions.detail.notYours') })
}

const state = useAsync(load, { keepData: true })
const action = computed(() => state.data.value)

/** Read with action.get: the caller decides here, or owns the agent that did it. */
const canDecide = computed(() => !fromMine.value)
const showDecide = computed(() => canDecide.value && action.value?.status === 'proposed')
const showReview = computed(
  () =>
    canDecide.value &&
    action.value?.status === 'executed' &&
    (action.value.review_state === 'pending' || action.value.review_state === 'escalated'),
)
const decidable = computed(() => showDecide.value || showReview.value)

// The caller's own decision (or review) on this that itself waits for
// approval, their action_decide being confirm_required. Core would take a
// second one, and the second would fail once the first is approved, so there
// is nothing more to do here meanwhile. It is in the approval queue, made
// after this action; ids run in time order, so the queue is read from here on.
const QUEUE_PAGE = 200
const QUEUE_PAGES = 5
async function findMyPending(): Promise<string | null> {
  const id = action.value?.id
  if (!id) return null
  let after: string | undefined = id
  for (let i = 0; i < QUEUE_PAGES; i++) {
    const out: ToolOut<'action.list_proposed'> = await read('action.list_proposed', {
      course_id: props.courseId,
      limit: QUEUE_PAGE,
      after,
    })
    const mine = (out.actions ?? []).find((x) => isAboutAction(x) && x.target_id === id && rules.isMine(x))
    if (mine) return mine.id
    if (!out.next) return null
    after = out.next
  }
  return null
}
const myPending = useAsync(findMyPending, { immediate: false })

// Whether it is the caller's to decide, as the queue says of it: it lists by
// id, so asking for the one after the id just before this one finds it.
async function queueSays(): Promise<boolean | null> {
  const a = action.value
  if (!a) return null
  const after = uuidPredecessor(a.id.toLowerCase())
  if (!after) return null
  const tool = a.status === 'proposed' ? 'action.list_proposed' : 'action.list_pending_review'
  try {
    const out = await read(tool, { course_id: props.courseId, after, limit: 1 })
    const x = out.actions?.[0]
    return x && x.id.toLowerCase() === a.id.toLowerCase() ? (x.yours_to_decide ?? null) : null
  } catch {
    return null
  }
}
const queued = useAsync(queueSays, { immediate: false })
/** The action, with what the queue says of whose it is to decide. */
const judged = computed<ActionRow | undefined>(() => {
  const a = action.value
  if (!a) return undefined
  const says = queued.data.value
  return typeof says === 'boolean' ? { ...a, yours_to_decide: says } : a
})
/** A decision just made, until the queue has been read again and says so itself. */
const justProposed = ref<string | null>(null)
async function checkMine() {
  if (!decidable.value) return
  await Promise.all([myPending.reload(), queued.reload()])
  if (!myPending.error.value) justProposed.value = null
}
const waiting = computed(() => (decidable.value ? (justProposed.value ?? myPending.data.value ?? null) : null))

/** What deciding or reviewing here came to, until the person closes it or leaves. */
const lastDone = ref<Done | null>(null)

watch(
  () => props.actionId,
  () => {
    state.data.value = undefined
    myPending.data.value = undefined
    queued.data.value = undefined
    justProposed.value = null
    lastDone.value = null
    void state.reload()
  },
)
// Once the action is known to be one the caller could decide or review.
watch(
  () => (decidable.value ? action.value?.id : null),
  (id) => {
    if (id) void checkMine()
  },
)

// Taking back a proposal that still waits (action.withdraw): one's own, or as
// the owner of the agent that made it.
const withdrawWrite = useWrite('action.withdraw')
const ownersAgent = computed(() => !!action.value && rules.isOwnAgent(action.value))
const canWithdraw = computed(
  () =>
    !!action.value &&
    action.value.status === 'proposed' &&
    (rules.isMine(action.value) || ownersAgent.value) &&
    course.writable,
)
async function withdraw() {
  const a = action.value
  if (!a) return
  const agent = ownersAgent.value
  try {
    await ElMessageBox.confirm(
      t(agent ? 'actions.withdraw.confirmAgent' : 'actions.withdraw.confirm'),
      t(agent ? 'actions.withdraw.titleAgent' : 'actions.withdraw.title'),
      { type: 'warning', confirmButtonText: t('actions.withdraw.action'), cancelButtonText: t('common.actions.cancel') },
    )
  } catch {
    return
  }
  const out = await withdrawWrite.run({ course_id: props.courseId, action_id: a.id }, { notify: false })
  if (!out) {
    const e = withdrawWrite.lastError.value
    if (e) notifyError(e)
    await reloadPage()
    return
  }
  announce(out, { success: t(agent ? 'actions.withdraw.doneAgent' : 'actions.withdraw.done') })
  lastDone.value = { kind: 'withdrawn', byOwner: agent }
  await reloadPage()
}

/** Reads the action again, and whatever this page shows about the actions around it. */
async function reloadPage() {
  refreshAfterDecision(props.courseId)
  await state.reload()
  await checkMine()
}

const back = computed(() =>
  canDecide.value
    ? { name: 'course-approvals', params: { courseId: props.courseId } }
    : { name: 'course-my-actions', params: { courseId: props.courseId } },
)

function onDone(d: Done) {
  if (d.kind === 'stale') ElMessage({ type: 'info', message: t('actions.detail.stale') })
  else lastDone.value = d
  if (d.kind === 'proposed') justProposed.value = d.actionId
  if (d.kind === 'decided' && d.out.outcome === 'executed') invalidateAfter(action.value?.action_type)
  void reloadPage()
}

// A decision or review: the action it is about.
const about = useLookup(() =>
  action.value && isAboutAction(action.value) ? specs.action(props.courseId, action.value.target_id) : null,
)
const aboutAction = computed(() => about.value?.value as ActionRow | undefined)
/** A link to another action, for someone who may open it (a decider). */
function actionRoute(id: string | null | undefined) {
  return canDecide.value ? routeFor(props.courseId, 'action', id) : null
}

const error = computed(() => (action.value ? storedError(action.value) : null))
const errorWhy = computed(() => reasonText(error.value))
const errorDetails = computed(() => {
  const d = error.value?.details
  if (!d) return null
  const rest = Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'reason' && k !== 'authz_reason'))
  return Object.keys(rest).length ? rest : null
})
const rejection = computed(() => (action.value ? storedDecision(action.value) : null))
/** An executed decision's result is the proposal's outcome. */
const decisionResult = computed<DecideResult | null>(() => {
  const a = action.value
  if (!a || a.action_type !== 'action.decide' || a.status !== 'executed' || !isObject(a.result)) return null
  return a.result as unknown as DecideResult
})
const hasResult = computed(() => {
  const r = action.value?.result
  return r !== undefined && r !== null && !(isObject(r) && Object.keys(r).length === 0)
})
const targetRoute = computed(() => {
  const a = action.value
  if (!a) return null
  return a.target_type === 'action' ? actionRoute(a.target_id) : routeFor(props.courseId, a.target_type, a.target_id)
})
const errorTitle = computed(() => {
  switch (action.value?.status) {
    case 'denied':
      return t('enums.actionStatus.denied')
    case 'cancelled':
      return t('actions.outcome.cancelled')
    case 'failed':
      return action.value?.decided_at ? t('actions.outcome.failed') : t('enums.actionStatus.failed')
  }
  return ''
})
</script>

<template>
  <div class="action-view">
    <AsyncState
      :loading="state.loading.value && !action"
      :error="action ? null : state.error.value"
      @retry="state.reload"
    >
      <template v-if="action">
        <PageHeader :title="typeLabel(action.action_type)" :back="back">
          <template #tags>
            <StatusTag vocab="actionStatus" :value="action.status" size="default" />
            <StatusTag
              v-if="action.review_state && action.review_state !== 'none'"
              vocab="reviewState"
              :value="action.review_state"
              size="default"
            />
          </template>
          <template #subtitle>
            <span class="action-view__subtitle">
              <ActionActor :member-id="action.member_id" :actor-id="action.actor_id" show-kind />
              <span>·</span>
              <TimeText :value="action.created_at" />
              <code class="action-view__code">{{ action.action_type }}</code>
            </span>
          </template>
          <el-button v-if="canWithdraw" :loading="withdrawWrite.pending.value" @click="withdraw">
            <el-icon><RefreshLeft /></el-icon>
            <span>{{ t('actions.withdraw.action') }}</span>
          </el-button>
          <el-button :loading="state.loading.value" @click="reloadPage">
            <el-icon><Refresh /></el-icon>
            <span>{{ t('common.actions.refresh') }}</span>
          </el-button>
        </PageHeader>

        <el-alert v-if="fromMine" type="info" show-icon :closable="false" class="action-view__notice">
          {{ t('actions.detail.fromMine') }}
        </el-alert>
        <el-alert
          v-else-if="ownersAgent && !course.can('action_decide')"
          type="info"
          show-icon
          :closable="false"
          class="action-view__notice"
        >
          {{ t('actions.detail.yourAgent') }}
        </el-alert>

        <OutcomeAlert
          v-if="lastDone"
          :course-id="courseId"
          :done="lastDone"
          closable
          class="action-view__notice"
          @close="lastDone = null"
        />

        <section v-if="showDecide || showReview" class="app-card action-view__decide">
          <h2 class="app-card__title">{{ showDecide ? t('actions.detail.decide') : t('actions.detail.review') }}</h2>
          <DecidePanel
            :action="judged ?? action"
            :course-id="courseId"
            :mode="showDecide ? 'decide' : 'review'"
            :waiting="waiting"
            @done="onDone"
          />
          <p v-if="waiting && lastDone?.kind !== 'proposed'" class="action-view__rule">
            <router-link :to="{ name: 'course-action', params: { courseId, actionId: waiting } }">
              {{ t('actions.decision.viewDecision') }}
            </router-link>
          </p>
          <p class="action-view__rule">{{ t('actions.decision.ruleNote') }}</p>
        </section>

        <div class="action-view__grid">
          <div class="action-view__main">
            <section class="app-card">
              <h2 class="app-card__title">{{ t('actions.detail.facts') }}</h2>
              <dl class="action-view__facts">
                <div>
                  <dt>{{ t('actions.fields.type') }}</dt>
                  <dd>{{ typeLabel(action.action_type) }}</dd>
                </div>
                <div>
                  <dt>{{ action.authz_result === 'confirm_required' ? t('actions.fields.proposer') : t('actions.fields.actor') }}</dt>
                  <dd class="action-view__inline">
                    <ActionActor :member-id="action.member_id" :actor-id="action.actor_id" show-kind />
                  </dd>
                </div>
                <div>
                  <dt>{{ t('actions.fields.actorId') }}</dt>
                  <dd><IdText :id="action.actor_id" /></dd>
                </div>
                <div>
                  <dt>{{ t('actions.fields.target') }}</dt>
                  <dd class="action-view__target">
                    <span class="action-view__inline">
                      <MaybeLink :to="targetRoute">{{ targetTypeLabel(action.target_type) }}</MaybeLink>
                      <IdText v-if="action.target_id" :id="action.target_id" />
                    </span>
                    <ActionTarget :action="action" :course-id="courseId" link />
                  </dd>
                </div>
                <div>
                  <dt>{{ t('actions.fields.authz') }}</dt>
                  <dd><StatusTag vocab="level" :value="action.authz_result" /></dd>
                </div>
                <div>
                  <dt>{{ t('actions.fields.status') }}</dt>
                  <dd class="action-view__inline">
                    <StatusTag vocab="actionStatus" :value="action.status" />
                    <StatusTag v-if="action.review_state !== 'none'" vocab="reviewState" :value="action.review_state" />
                  </dd>
                </div>
                <div>
                  <dt>{{ t('actions.fields.actionId') }}</dt>
                  <dd><IdText :id="action.id" full /></dd>
                </div>
              </dl>
            </section>

            <section v-if="action.action_type === 'conversation.answer'" class="app-card">
              <h2 class="app-card__title">{{ t('actions.answer.title') }}</h2>
              <AnswerProposal :action="action" :course-id="courseId" />
            </section>

            <section v-if="action.action_type === 'member.add_delegate' && action.status === 'proposed'" class="app-card">
              <h2 class="app-card__title">{{ t('actions.delegate.title') }}</h2>
              <DelegateGrant :action="action" :course-id="courseId" />
            </section>

            <section class="app-card">
              <h2 class="app-card__title">{{ t('actions.detail.what') }}</h2>
              <p class="action-view__help">{{ t('actions.detail.whatHelp') }}</p>
              <div v-if="isAboutAction(action)" class="action-view__about">
                <span class="action-view__about-label">{{ t('actions.detail.about') }}</span>
                <template v-if="aboutAction">
                  <router-link
                    :to="{ name: 'course-action', params: { courseId, actionId: aboutAction.id } }"
                    class="action-view__about-type"
                  >
                    {{ typeLabel(aboutAction.action_type) }}
                  </router-link>
                  <StatusTag vocab="actionStatus" :value="aboutAction.status" />
                  <ActionActor :member-id="aboutAction.member_id" :actor-id="aboutAction.actor_id" show-kind />
                  <ActionTarget :action="aboutAction" :course-id="courseId" :depth="1" link />
                </template>
                <MaybeLink v-else :to="actionRoute(action.target_id)">
                  <IdText :id="action.target_id" />
                </MaybeLink>
              </div>
              <FieldsView :course-id="courseId" :value="action.payload" :action="action" />
              <el-collapse class="action-view__raw">
                <el-collapse-item :title="t('actions.detail.raw')" name="raw">
                  <JsonView :value="action.payload" />
                </el-collapse-item>
              </el-collapse>
            </section>

            <section v-if="action.action_type === 'member.add' && action.status === 'proposed'" class="app-card">
              <h2 class="app-card__title">{{ t('actions.grant.title') }}</h2>
              <SeatGrant :action="action" :course-id="courseId" />
            </section>
          </div>

          <div class="action-view__side">
            <section class="app-card">
              <h2 class="app-card__title">{{ t('actions.detail.history') }}</h2>
              <ActionTimeline :action="action" />
            </section>

            <section class="app-card">
              <h2 class="app-card__title">{{ t('actions.detail.result') }}</h2>
              <p v-if="action.status === 'proposed'" class="action-view__help">
                {{ course.writable ? t('actions.result.waiting') : t('actions.result.archived') }}
              </p>

              <el-alert
                v-else-if="error || action.status === 'failed' || action.status === 'denied' || action.status === 'cancelled'"
                :type="action.status === 'cancelled' ? 'warning' : 'error'"
                :title="errorTitle"
                :closable="false"
                show-icon
              >
                <div class="action-view__error">
                  <p v-if="errorWhy">{{ errorWhy }}</p>
                  <p v-if="error">
                    {{ t('actions.outcome.coreSays') }}: {{ error.message }} <code>{{ error.code }}</code>
                  </p>
                  <FieldsView v-if="errorDetails" :course-id="courseId" :value="errorDetails" />
                </div>
              </el-alert>

              <el-alert
                v-else-if="action.status === 'rejected'"
                type="info"
                :title="t('actions.outcome.rejected')"
                :closable="false"
                show-icon
              >
                <div class="action-view__error">
                  <p v-if="rules.byOwner(action, 'decided')">{{ t('actions.result.rejectedByOwner') }}</p>
                  <p>
                    {{
                      rejection?.reason
                        ? t('actions.outcome.reasonLabel', { reason: rejection.reason })
                        : t('actions.result.rejectedNoReason')
                    }}
                  </p>
                  <p v-if="rejection?.byActionId" class="action-view__inline">
                    {{ t('actions.outcome.decisionAction') }}
                    <MaybeLink :to="actionRoute(rejection.byActionId)">
                      <IdText :id="rejection.byActionId" />
                    </MaybeLink>
                  </p>
                </div>
              </el-alert>

              <template v-else-if="decisionResult">
                <OutcomeAlert :course-id="courseId" :done="{ kind: 'decided', decision: 'approve', out: decisionResult }" />
              </template>

              <template v-else-if="action.status === 'executed'">
                <p v-if="rules.byOwner(action, 'decided')" class="action-view__owner">
                  <el-icon><Cpu /></el-icon>{{ t('actions.result.approvedByOwner') }}
                </p>
                <p class="action-view__help">{{ t('actions.result.made') }}</p>
                <FieldsView v-if="hasResult" :course-id="courseId" :value="action.result" />
                <p v-else class="action-view__help">{{ t('actions.result.none') }}</p>
              </template>

              <el-collapse v-if="hasResult" class="action-view__raw">
                <el-collapse-item :title="t('actions.detail.rawResult')" name="raw">
                  <JsonView :value="action.result" />
                </el-collapse-item>
              </el-collapse>
            </section>
          </div>
        </div>
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.action-view__subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.action-view__code {
  font-family: var(--app-font-mono);
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
.action-view__notice {
  margin-bottom: 16px;
}
.action-view__decide {
  margin-bottom: 16px;
}
.action-view__rule {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.action-view__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 360px);
  gap: 16px;
  align-items: start;
}
.action-view__main,
.action-view__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.action-view__main .app-card + .app-card,
.action-view__side .app-card + .app-card {
  margin-top: 0;
}
@media (max-width: 960px) {
  .action-view__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  /* On a narrow screen what became of it comes first. */
  .action-view__side {
    order: -1;
  }
}
.action-view__facts {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.action-view__facts > div {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  align-items: baseline;
}
.action-view__facts > div:last-child {
  border-bottom: none;
}
.action-view__facts dt {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.action-view__facts dd {
  margin: 0;
  min-width: 0;
  font-size: 14px;
  word-break: break-word;
}
@media (max-width: 600px) {
  .action-view__facts > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
.action-view__inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.action-view__target {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.action-view__help {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.action-view__about {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
}
.action-view__about-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.action-view__about-type {
  font-weight: 600;
  text-decoration: none;
}
.action-view__owner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-color-primary);
}
.action-view__raw {
  margin-top: 12px;
  border-top: none;
}
.action-view__error p {
  margin: 0 0 4px;
  word-break: break-word;
}
.action-view__error code {
  font-family: var(--app-font-mono);
  font-size: 11px;
  opacity: 0.8;
}
</style>
