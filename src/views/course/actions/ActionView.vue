<script setup lang="ts">
// One action in full (action.get): what was asked, who asked, at what level it
// was authorized, what became of it, who decided or reviewed it, and when.
// action.get needs action_decide; anyone else sees an action of their own
// from action.list_mine instead, which carries the same fields.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import JsonView from '@/components/JsonView.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActionActor from './components/ActionActor.vue'
import ActionTarget from './components/ActionTarget.vue'
import ActionTimeline from './components/ActionTimeline.vue'
import DecidePanel from './components/DecidePanel.vue'
import FieldsView from './components/FieldsView.vue'
import MaybeLink from './components/MaybeLink.vue'
import OutcomeAlert from './components/OutcomeAlert.vue'
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
  type ActionRow,
} from './components/actionText'
import type { DecideResult, Done } from './components/decide'
import { forget, useLookup, useSpecs } from './components/lookups'

const props = defineProps<{ courseId: string; actionId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const specs = useSpecs()

const fromMine = ref(false)
const MINE_PAGE = 200
const MINE_PAGES = 25

async function load(): Promise<ActionRow> {
  fromMine.value = false
  if (course.can('action_decide')) {
    try {
      return await read('action.get', { course_id: props.courseId, action_id: props.actionId })
    } catch (e) {
      if (!(e instanceof ApiError && e.isForbidden)) throw e
    }
  }
  // Not a decider here: an action of one's own is in action.list_mine.
  let after: string | undefined
  for (let i = 0; i < MINE_PAGES; i++) {
    const out = await read('action.list_mine', { course_id: props.courseId, limit: MINE_PAGE, after })
    const found = (out.actions ?? []).find((a) => a.id === props.actionId)
    if (found) {
      fromMine.value = true
      return found
    }
    if (!out.next) break
    after = out.next
  }
  throw new ApiError({ status: 403, code: 'forbidden', message: t('actions.detail.notYours') })
}

const state = useAsync(load, { keepData: true })
const action = computed(() => state.data.value)
watch(
  () => props.actionId,
  () => {
    state.data.value = undefined
    lastDone.value = null
    void state.reload()
  },
)

const canDecide = computed(() => course.can('action_decide') && !fromMine.value)
const showDecide = computed(() => canDecide.value && action.value?.status === 'proposed')
const showReview = computed(
  () =>
    canDecide.value &&
    action.value?.status === 'executed' &&
    (action.value.review_state === 'pending' || action.value.review_state === 'escalated'),
)

const back = computed(() =>
  canDecide.value
    ? { name: 'course-approvals', params: { courseId: props.courseId } }
    : { name: 'course-my-actions', params: { courseId: props.courseId } },
)

const lastDone = ref<Done | null>(null)
function onDone(d: Done) {
  if (d.kind !== 'stale') lastDone.value = d
  if (d.kind === 'decided' && d.out.outcome === 'executed') invalidateAfter(action.value?.action_type)
  forget(`${props.courseId}:action:${props.actionId}`)
  void state.reload()
}

// A decision or review: the action it is about.
const about = useLookup(() =>
  action.value && isAboutAction(action.value) ? specs.action(props.courseId, action.value.target_id) : null,
)
const aboutAction = computed(() => about.value?.value as ActionRow | undefined)

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
const targetRoute = computed(() =>
  action.value ? routeFor(props.courseId, action.value.target_type, action.value.target_id) : null,
)
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
          <el-button :loading="state.loading.value" @click="state.reload">
            <el-icon><Refresh /></el-icon>
            <span>{{ t('common.actions.refresh') }}</span>
          </el-button>
        </PageHeader>

        <el-alert v-if="fromMine" type="info" show-icon :closable="false" class="action-view__notice">
          {{ t('actions.detail.fromMine') }}
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
          <DecidePanel :action="action" :course-id="courseId" :mode="showDecide ? 'decide' : 'review'" @done="onDone" />
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
                <MaybeLink v-else :to="routeFor(courseId, 'action', action.target_id)">
                  <IdText :id="action.target_id" />
                </MaybeLink>
              </div>
              <FieldsView :course-id="courseId" :value="action.payload" />
              <el-collapse class="action-view__raw">
                <el-collapse-item :title="t('actions.detail.raw')" name="raw">
                  <JsonView :value="action.payload" />
                </el-collapse-item>
              </el-collapse>
            </section>
          </div>

          <div class="action-view__side">
            <section class="app-card">
              <h2 class="app-card__title">{{ t('actions.detail.history') }}</h2>
              <ActionTimeline :action="action" />
            </section>

            <section class="app-card">
              <h2 class="app-card__title">{{ t('actions.detail.result') }}</h2>
              <p v-if="action.status === 'proposed'" class="action-view__help">{{ t('actions.result.waiting') }}</p>

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
                  <p>
                    {{
                      rejection?.reason
                        ? t('actions.outcome.reasonLabel', { reason: rejection.reason })
                        : t('actions.result.rejectedNoReason')
                    }}
                  </p>
                  <p v-if="rejection?.byActionId" class="action-view__inline">
                    {{ t('actions.outcome.decisionAction') }}
                    <MaybeLink :to="routeFor(courseId, 'action', rejection.byActionId)">
                      <IdText :id="rejection.byActionId" />
                    </MaybeLink>
                  </p>
                </div>
              </el-alert>

              <template v-else-if="decisionResult">
                <OutcomeAlert :course-id="courseId" :done="{ kind: 'decided', decision: 'approve', out: decisionResult }" />
              </template>

              <template v-else-if="action.status === 'executed'">
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
  border-radius: 8px;
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
