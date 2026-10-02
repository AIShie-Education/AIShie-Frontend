<script setup lang="ts">
// The two queues a person with action_decide works through: proposals waiting
// for a decision (action.list_proposed), and actions that ran pending review
// and have not been looked at, or were escalated (action.list_pending_review).
// Each is decided or reviewed in place (action.decide, action.review), and
// what became of it is kept on the page until the person leaves.
//
// A person without action_decide who owns an agent seated here is shown their
// own agents' actions alone, under a title that says so: they decide those
// where they could have done the same themselves without anyone's
// confirmation (yours_to_decide), as their own doing of it, and each other
// says why someone else decides it. Either may take back their agent's
// proposal while it waits. A queue Core will not show the caller is simply
// empty for them: nothing in it is theirs.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError, read } from '@/api/http'
import { usePaged } from '@/composables/useAsync'
import { usePageTitle } from '@/router/title'
import { useCourseStore } from '@/stores/course'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import ActionCard from './components/ActionCard.vue'
import ActionTarget from './components/ActionTarget.vue'
import OutcomeAlert from './components/OutcomeAlert.vue'
import { invalidateAfter, isAboutAction, typeLabel, useJudgeRules, type ActionRow } from './components/actionText'
import type { Done } from './components/decide'
import { refreshAfterDecision } from './components/lookups'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const course = useCourseStore()

type Tab = 'proposed' | 'review'
const tab = ref<Tab>(route.query.tab === 'review' ? 'review' : 'proposed')
watch(tab, (v) => {
  void router.replace({ query: { ...route.query, tab: v === 'review' ? 'review' : undefined } })
})

/** The caller decides nothing here: what the queues show them is their own agents'. */
const agentsOnly = computed(() => !course.can('action_decide'))
usePageTitle('course-approvals', () => (agentsOnly.value ? 'actions.approvals.agentsTitle' : null))
const PAGE = 50

/** One page of a queue; a queue the caller may not read has nothing of theirs in it. */
async function queuePage(tool: 'action.list_proposed' | 'action.list_pending_review', after: string | undefined) {
  try {
    const o = await read(tool, { course_id: props.courseId, limit: PAGE, after })
    return { items: o.actions, next: o.next }
  } catch (e) {
    if (e instanceof ApiError && e.isForbidden) return { items: [], next: null }
    throw e
  }
}
const proposed = usePaged<ActionRow>((after) => queuePage('action.list_proposed', after))
const review = usePaged<ActionRow>((after) => queuePage('action.list_pending_review', after))

function count(list: { items: { value: unknown[] }; hasMore: { value: boolean } }) {
  return `${list.items.value.length}${list.hasMore.value ? '+' : ''}`
}

interface Recent {
  key: number
  action: ActionRow
  done: Done
}
const recent = ref<Recent[]>([])
let seq = 0
const rules = useJudgeRules()
/** Reads of the approval queue started so far. */
let queueReads = 0
/**
 * Proposals the caller has decided here, where that decision itself waits for
 * approval: id → the decision's id, and how many reads of the queue had
 * started when it was made. The queue shows the same once it is read again,
 * but only as far as it is loaded (oldest first, and a decision comes after
 * what it decides); this covers the rest until the decision is dealt with
 * (prune).
 */
const decidedHere = reactive(new Map<string, { decision: string; reads: number }>())
/** The caller's own decisions still waiting for approval, by what they decide. */
const myPending = computed(() => {
  const m = new Map<string, string>()
  for (const [target, e] of decidedHere) m.set(target, e.decision)
  for (const x of proposed.items.value) {
    if (isAboutAction(x) && x.target_id && x.status === 'proposed' && rules.isMine(x)) m.set(x.target_id, x.id)
  }
  return m
})

/**
 * After the queue read numbered readNo: lets go of decisions made here that no
 * longer wait (approved, rejected, cancelled or expired meanwhile). The queue
 * holds only what waits, so a decision missing from a queue read to its end
 * is done; otherwise Core is asked. One made after the read began is kept.
 */
async function prune(readNo: number) {
  const listed = new Set(proposed.items.value.map((x) => x.id))
  const complete = !proposed.hasMore.value && !proposed.error.value
  await Promise.all(
    [...decidedHere].map(async ([target, e]) => {
      if (e.reads >= readNo || listed.has(e.decision)) return
      if (complete) {
        decidedHere.delete(target)
        return
      }
      try {
        const a = await read('action.get', { course_id: props.courseId, action_id: e.decision })
        if (a.status !== 'proposed') decidedHere.delete(target)
      } catch {
        // Cannot tell: keep holding back rather than invite a second decision.
      }
    }),
  )
}

async function reloadProposed() {
  const n = ++queueReads
  await proposed.reload()
  await prune(n)
}

function refresh() {
  refreshAfterDecision(props.courseId)
  void reloadProposed()
  void review.reload()
}

function onDone(a: ActionRow, d: Done, which: Tab) {
  const list = which === 'proposed' ? proposed : review
  refreshAfterDecision(props.courseId)
  if (d.kind === 'stale') {
    ElMessage({ type: 'info', message: t('actions.approvals.stale') })
    if (which === 'proposed') void reloadProposed()
    else void review.reload()
    return
  }
  if (d.kind === 'decided' && d.out.outcome === 'executed') invalidateAfter(a.action_type)
  recent.value = [{ key: ++seq, action: a, done: d }, ...recent.value]
  if (d.kind === 'withdrawn') {
    // Cancelled: it waits for nobody now.
    list.items.value = list.items.value.filter((x) => x.id !== a.id)
    void reloadProposed()
    return
  }
  if (d.kind === 'proposed') {
    // The proposal still waits; so, now, does the caller's decision on it,
    // which joins the approval queue.
    decidedHere.set(a.id, { decision: d.actionId, reads: queueReads })
    void reloadProposed()
    return
  }
  if (d.kind === 'reviewed' && d.state === 'escalated') {
    // Still in the review queue, now waiting for someone else.
    list.items.value = list.items.value.map((x) =>
      x.id === a.id ? { ...x, review_state: 'escalated', reviewed_by_member_id: course.myMemberId ?? undefined, reviewed_at: new Date().toISOString() } : x,
    )
    return
  }
  list.items.value = list.items.value.filter((x) => x.id !== a.id)
  // Deciding a decision carries out (or not) the proposal underneath, which
  // may be listed too, and settles the caller's own decisions waiting on it.
  if (isAboutAction(a)) refresh()
}

function dismiss(key: number) {
  recent.value = recent.value.filter((r) => r.key !== key)
}

// The page's rules (what deciding does, who may decide what) are one
// disclosure under its title: open the first time the page is shown in this
// browser, closed after that unless the person left them open. Where the
// browser keeps nothing, they start closed, so they never push the queue down
// on every visit.
const RULES_KEY = 'aishie.approvalsRules'
function rulesAtFirst(): boolean {
  try {
    const was = localStorage.getItem(RULES_KEY)
    if (was) return was === 'open'
    // Seen now: the next visit starts closed.
    localStorage.setItem(RULES_KEY, 'closed')
    return true
  } catch {
    return false
  }
}
const rulesOpen = ref(rulesAtFirst())
function toggleRules() {
  rulesOpen.value = !rulesOpen.value
  try {
    localStorage.setItem(RULES_KEY, rulesOpen.value ? 'open' : 'closed')
  } catch {
    // Not remembered: they start closed next time.
  }
}
</script>

<template>
  <div class="approvals">
    <PageHeader
      :title="agentsOnly ? t('actions.approvals.agentsTitle') : t('actions.approvals.title')"
      :subtitle="agentsOnly ? t('actions.approvals.agentsSubtitle') : t('actions.approvals.subtitle')"
    >
      <template #tags>
        <el-tooltip
          v-if="course.needsApproval('action_decide')"
          :content="t('actions.approvals.decisionsNeedApprovalHelp')"
          placement="bottom"
        >
          <el-tag type="warning" effect="plain">{{ t('actions.approvals.decisionsNeedApproval') }}</el-tag>
        </el-tooltip>
      </template>
      <el-button
        text
        class="approvals__rules-toggle"
        :aria-expanded="rulesOpen ? 'true' : 'false'"
        aria-controls="approvals-rules"
        @click="toggleRules"
      >
        <el-icon><InfoFilled /></el-icon>
        <span>{{ t('actions.approvals.rules') }}</span>
        <el-icon class="el-icon--right approvals__rules-chevron" :class="{ 'is-open': rulesOpen }" aria-hidden="true">
          <ArrowDown />
        </el-icon>
      </el-button>
      <el-button :loading="proposed.loading.value || review.loading.value" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
    </PageHeader>

    <section v-show="rulesOpen" id="approvals-rules" class="approvals__rules" :aria-label="t('actions.approvals.rules')">
      <!-- Said above both tabs, so each tab's rule starts with the tab's name. -->
      <ul class="approvals__rules-list">
        <i18n-t
          :keypath="agentsOnly ? 'actions.approvals.agentsProposedHelp' : 'actions.approvals.proposedHelp'"
          tag="li"
          scope="global"
        >
          <template #tab><strong>{{ t('actions.approvals.tabs.proposed') }}</strong></template>
        </i18n-t>
        <i18n-t
          :keypath="agentsOnly ? 'actions.approvals.agentsReviewHelp' : 'actions.approvals.reviewHelp'"
          tag="li"
          scope="global"
        >
          <template #tab><strong>{{ t('actions.approvals.tabs.review') }}</strong></template>
        </i18n-t>
        <li>{{ agentsOnly ? t('actions.decision.ownerRuleNote') : t('actions.decision.ruleNote') }}</li>
        <li>{{ t('actions.approvals.oldestFirst') }}</li>
      </ul>
      <i18n-t v-if="agentsOnly" keypath="actions.approvals.agentsMine" tag="p" scope="global" class="approvals__rules-more">
        <template #link>
          <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{ t('actions.mine.title') }}</router-link>
        </template>
      </i18n-t>
    </section>

    <section v-if="recent.length" class="app-card approvals__recent">
      <h2 class="app-card__title">
        <span>{{ t('actions.approvals.recent') }}</span>
        <el-button link type="primary" @click="recent = []">{{ t('actions.approvals.clearRecent') }}</el-button>
      </h2>
      <p class="approvals__help">{{ t('actions.approvals.recentHelp') }}</p>
      <div v-for="r in recent" :key="r.key" class="approvals__recent-item">
        <div class="approvals__recent-head">
          <router-link :to="{ name: 'course-action', params: { courseId, actionId: r.action.id } }" class="approvals__recent-type">
            {{ typeLabel(r.action.action_type) }}
          </router-link>
          <ActionTarget :action="r.action" :course-id="courseId" />
        </div>
        <OutcomeAlert :course-id="courseId" :done="r.done" closable @close="dismiss(r.key)" />
      </div>
    </section>

    <div class="app-card">
      <el-tabs v-model="tab" class="approvals__tabs">
        <el-tab-pane name="proposed">
          <template #label>
            <span class="approvals__tab">
              <el-icon><Stamp /></el-icon>
              {{ t('actions.approvals.tabs.proposed') }}
              <el-badge
                v-if="proposed.items.value.length"
                :value="count(proposed)"
                type="warning"
                class="approvals__badge"
              />
            </span>
          </template>
          <AsyncState
            :loading="proposed.loading.value && !proposed.items.value.length"
            :error="proposed.error.value"
            :empty="!proposed.items.value.length"
            :empty-text="agentsOnly ? t('actions.approvals.agentsEmptyProposed') : t('actions.approvals.emptyProposed')"
            @retry="reloadProposed"
          >
            <div class="approvals__list">
              <ActionCard
                v-for="a in proposed.items.value"
                :key="a.id"
                :action="a"
                :course-id="courseId"
                mode="decide"
                :waiting="myPending.get(a.id)"
                @done="(d) => onDone(a, d, 'proposed')"
              />
            </div>
            <LoadMore :has-more="proposed.hasMore.value" :loading="proposed.loading.value" @more="proposed.loadMore" />
          </AsyncState>
        </el-tab-pane>

        <el-tab-pane name="review">
          <template #label>
            <span class="approvals__tab">
              <el-icon><View /></el-icon>
              {{ t('actions.approvals.tabs.review') }}
              <el-badge v-if="review.items.value.length" :value="count(review)" type="primary" class="approvals__badge" />
            </span>
          </template>
          <AsyncState
            :loading="review.loading.value && !review.items.value.length"
            :error="review.error.value"
            :empty="!review.items.value.length"
            :empty-text="agentsOnly ? t('actions.approvals.agentsEmptyReview') : t('actions.approvals.emptyReview')"
            @retry="review.reload"
          >
            <div class="approvals__list">
              <ActionCard
                v-for="a in review.items.value"
                :key="a.id"
                :action="a"
                :course-id="courseId"
                mode="review"
                :waiting="myPending.get(a.id)"
                @done="(d) => onDone(a, d, 'review')"
              />
            </div>
            <LoadMore :has-more="review.hasMore.value" :loading="review.loading.value" @more="review.loadMore" />
          </AsyncState>
        </el-tab-pane>
      </el-tabs>
    </div>

  </div>
</template>

<style scoped>
.approvals__rules {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-left: 3px solid var(--app-indigo-line);
  border-radius: 0 var(--app-radius-item) var(--app-radius-item) 0;
  background: color-mix(in srgb, var(--app-indigo-tint) 50%, transparent);
  font-size: 14px;
  line-height: 1.6;
  color: var(--app-ink-2);
}
.approvals__rules-list {
  margin: 0 0 4px;
  padding-left: 1.2em;
}
.approvals__rules-list li + li {
  margin-top: 4px;
}
.approvals__rules-list strong {
  font-weight: 600;
  color: var(--app-ink);
}
.approvals__rules-more {
  margin: 8px 0 0;
}
.approvals__rules-toggle .el-icon {
  color: var(--app-ink-3);
}
.approvals__rules-chevron {
  transition: transform 0.15s ease;
}
.approvals__rules-chevron.is-open {
  transform: rotate(180deg);
}
.approvals__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.approvals__badge {
  display: inline-flex;
}
.approvals__badge :deep(.el-badge__content) {
  position: static;
  transform: none;
}
.approvals__help {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.approvals__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.approvals__recent-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.approvals__recent-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.approvals__recent-type {
  font-weight: 600;
  text-decoration: none;
}
.approvals__tabs :deep(.el-tabs__item) {
  padding: 0 14px;
}
@media (max-width: 480px) {
  /* Flush with the title above it, as the page's other text is. */
  .approvals__rules-toggle {
    padding-left: 0;
    padding-right: 0;
  }
  .approvals__tabs :deep(.el-tabs__item) {
    padding: 0 8px;
    font-size: 13px;
  }
}
</style>
