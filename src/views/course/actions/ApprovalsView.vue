<script setup lang="ts">
// The two queues a person with action_decide works through: proposals waiting
// for a decision (action.list_proposed), and actions that ran pending review
// and have not been looked at, or were escalated (action.list_pending_review).
// Each is decided or reviewed in place (action.decide, action.review), and
// what became of it is kept on the page until the person leaves.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { read } from '@/api/http'
import { usePaged } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import ActionCard from './components/ActionCard.vue'
import ActionTarget from './components/ActionTarget.vue'
import OutcomeAlert from './components/OutcomeAlert.vue'
import { invalidateAfter, isAboutAction, typeLabel, useJudgeRules, type ActionRow } from './components/actionText'
import type { Done } from './components/decide'
import { forget } from './components/lookups'

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

const allowed = computed(() => course.can('action_decide'))
const PAGE = 50

const proposed = usePaged<ActionRow>(
  (after) =>
    read('action.list_proposed', { course_id: props.courseId, limit: PAGE, after }).then((o) => ({
      items: o.actions,
      next: o.next,
    })),
  { immediate: allowed.value },
)
const review = usePaged<ActionRow>(
  (after) =>
    read('action.list_pending_review', { course_id: props.courseId, limit: PAGE, after }).then((o) => ({
      items: o.actions,
      next: o.next,
    })),
  { immediate: allowed.value },
)

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
/** Proposals the caller has decided, where that decision itself waits for approval: id → the decision's id. */
const waiting = reactive(new Map<string, string>())
const rules = useJudgeRules()
/** …including those found in the queue itself: the caller's own decisions, still proposed. */
const myPending = computed(() => {
  const m = new Map<string, string>(waiting)
  for (const x of proposed.items.value) {
    if (isAboutAction(x) && x.target_id && x.status === 'proposed' && rules.isMine(x)) m.set(x.target_id, x.id)
  }
  return m
})

function refresh() {
  void proposed.reload()
  void review.reload()
}

function onDone(a: ActionRow, d: Done, which: Tab) {
  const list = which === 'proposed' ? proposed : review
  if (d.kind === 'stale') {
    ElMessage({ type: 'info', message: t('actions.approvals.stale') })
    void list.reload()
    return
  }
  forget(`${props.courseId}:action:${a.id}`)
  if (d.kind === 'decided' && d.out.outcome === 'executed') invalidateAfter(a.action_type)
  recent.value = [{ key: ++seq, action: a, done: d }, ...recent.value]
  if (d.kind === 'proposed') {
    // The proposal still waits; so, now, does the caller's decision on it.
    waiting.set(a.id, d.actionId)
    void list.reload()
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
  // may be listed too.
  if (isAboutAction(a)) refresh()
}

function dismiss(key: number) {
  recent.value = recent.value.filter((r) => r.key !== key)
}
</script>

<template>
  <div class="approvals">
    <PageHeader :title="t('actions.approvals.title')" :subtitle="t('actions.approvals.subtitle')">
      <template #tags>
        <el-tooltip
          v-if="course.needsApproval('action_decide')"
          :content="t('actions.approvals.decisionsNeedApprovalHelp')"
          placement="bottom"
        >
          <el-tag type="warning" effect="plain">{{ t('actions.approvals.decisionsNeedApproval') }}</el-tag>
        </el-tooltip>
      </template>
      <el-button v-if="allowed" :loading="proposed.loading.value || review.loading.value" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
    </PageHeader>

    <div v-if="!allowed" class="app-card">
      <el-result icon="info" :title="t('common.errors.forbidden')" :sub-title="t('actions.approvals.noPermission')">
        <template #extra>
          <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{ t('actions.mine.title') }}</router-link>
        </template>
      </el-result>
    </div>

    <template v-else>
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
            <p class="approvals__help">{{ t('actions.approvals.proposedHelp') }}</p>
            <p class="approvals__help approvals__help--small">
              <el-icon><Sort /></el-icon> {{ t('actions.approvals.oldestFirst') }} · {{ t('actions.decision.ruleNote') }}
            </p>
            <AsyncState
              :loading="proposed.loading.value && !proposed.items.value.length"
              :error="proposed.error.value"
              :empty="!proposed.items.value.length"
              :empty-text="t('actions.approvals.emptyProposed')"
              @retry="proposed.reload"
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
            <p class="approvals__help">{{ t('actions.approvals.reviewHelp') }}</p>
            <p class="approvals__help approvals__help--small">
              <el-icon><Sort /></el-icon> {{ t('actions.approvals.oldestFirst') }} · {{ t('actions.decision.ruleNote') }}
            </p>
            <AsyncState
              :loading="review.loading.value && !review.items.value.length"
              :error="review.error.value"
              :empty="!review.items.value.length"
              :empty-text="t('actions.approvals.emptyReview')"
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
    </template>
  </div>
</template>

<style scoped>
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
.approvals__help--small {
  font-size: 12px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-bottom: 16px;
}
.approvals__help--small .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
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
  .approvals__tabs :deep(.el-tabs__item) {
    padding: 0 8px;
    font-size: 13px;
  }
}
</style>
