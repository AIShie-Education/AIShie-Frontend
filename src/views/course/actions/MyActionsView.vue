<script setup lang="ts">
// The caller's own actions in this course (action.list_mine): everything they
// did or tried, proposals included, and what became of each. It is how an
// agent's operator — or anyone who proposed something — learns the outcome:
// a rejection's reason, or what a proposal sent back for changes should
// change, and which earlier proposal a revision revises.
// Core lists them oldest first; they are all loaded (up to a limit) and shown
// newest first, or oldest first if the person prefers.
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { read, type ApiError } from '@/api/http'
import { toApiError } from '@/composables/useAsync'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import ActionActor from './components/ActionActor.vue'
import ActionTarget from './components/ActionTarget.vue'
import RevisesLine from './components/RevisesLine.vue'
import { reasonText, storedDecision, storedError, typeLabel, type ActionRow } from './components/actionText'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const router = useRouter()
const session = useSessionStore()
// Status and when go under the action, and who decided is left out (it is on
// the action's page), where the page is narrower than 720 px (the card's help
// 669 px or less), by its own width, not the window's: the side bar takes from
// it.
const help = useTemplateRef<HTMLElement>('help')
const narrow = useContainerNarrow(help, 669)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, narrow)

const PAGE = 200
/** Pages loaded in one go before asking the person whether to go on. */
const PAGES_AT_ONCE = 10

/**
 * A chat's messages are actions too, and would bury everything else: they are
 * left out (action.list_mine's exclude_types) unless the person asks for them,
 * and so is marking a conversation read, which opening an answer does.
 */
const CHAT_TYPES = ['conversation.ask', 'conversation.answer', 'conversation.mark_read']
const showChat = ref(false)

const items = ref<ActionRow[]>([])
const loading = ref(false)
const error = ref<ApiError | null>(null)
const more = ref(false)
let next: string | undefined
let generation = 0

async function load(reset: boolean) {
  const mine = reset ? ++generation : generation
  loading.value = true
  error.value = null
  if (reset) {
    next = undefined
    items.value = []
    more.value = false
  }
  try {
    for (let i = 0; i < PAGES_AT_ONCE; i++) {
      const out = await read('action.list_mine', {
        course_id: props.courseId,
        limit: PAGE,
        after: next,
        exclude_types: showChat.value ? undefined : CHAT_TYPES,
      })
      if (mine !== generation) return
      items.value = [...items.value, ...(out.actions ?? [])]
      next = out.next ?? undefined
      if (!next) break
    }
    more.value = !!next
  } catch (e) {
    if (mine === generation) error.value = toApiError(e)
  } finally {
    if (mine === generation) loading.value = false
  }
}
onMounted(() => void load(true))
watch(showChat, () => void load(true))

// Filters, order and paging, all over what is loaded.
const status = ref<string>('')
const type = ref<string>('')
const order = ref<'newest' | 'oldest'>('newest')
const page = ref(1)
const PER_PAGE = 20
watch([status, type, order], () => (page.value = 1))

const STATUS_ORDER = [
  'proposed',
  'executed',
  'failed',
  'rejected',
  'changes_requested',
  'cancelled',
  'denied',
  'approved',
]
const statusCounts = computed(() => {
  const m = new Map<string, number>()
  for (const a of items.value) m.set(a.status, (m.get(a.status) ?? 0) + 1)
  return STATUS_ORDER.filter((s) => m.has(s)).map((s) => ({ value: s, n: m.get(s)! }))
})
const types = computed(() => {
  const set = new Set(items.value.map((a) => a.action_type))
  return [...set].map((v) => ({ value: v, label: typeLabel(v) })).sort((a, b) => a.label.localeCompare(b.label))
})
const waitingCount = computed(() => items.value.filter((a) => a.status === 'proposed').length)
const reviewCount = computed(
  () => items.value.filter((a) => a.review_state === 'pending' || a.review_state === 'escalated').length,
)

const filtered = computed(() => {
  const rows = items.value.filter((a) => (!status.value || a.status === status.value) && (!type.value || a.action_type === type.value))
  return order.value === 'newest' ? [...rows].reverse() : rows
})
const shown = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))

/** A line saying why it did not happen, where it did not. */
function outcomeNote(a: ActionRow): string | null {
  const e = storedError(a)
  if (e) return reasonText(e) ?? `${t('actions.outcome.coreSays')}: ${e.message}`
  const d = storedDecision(a)
  if (!d?.reason) return null
  return a.status === 'changes_requested'
    ? t('actions.outcome.changesLabel', { note: d.reason })
    : t('actions.outcome.reasonLabel', { reason: d.reason })
}

function open(row: ActionRow) {
  void router.push({ name: 'course-action', params: { courseId: props.courseId, actionId: row.id } })
}
</script>

<template>
  <div class="my-actions">
    <PageHeader :title="t('actions.mine.title')" :subtitle="t('actions.mine.subtitle')">
      <el-button :loading="loading" @click="load(true)">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
    </PageHeader>

    <div class="app-card">
      <p ref="help" class="my-actions__help">
        {{ t('actions.mine.help') }}
        <template v-if="session.me?.kind === 'agent'">{{ t('actions.mine.helpAgent') }}</template>
      </p>

      <div v-if="waitingCount || reviewCount" class="my-actions__summary">
        <el-tag v-if="waitingCount" type="warning" effect="light" class="my-actions__chip" @click="status = 'proposed'">
          <el-icon><Clock /></el-icon>
          {{ t('actions.mine.waiting', { n: waitingCount }) }}
        </el-tag>
        <el-tag v-if="reviewCount" type="primary" effect="light">
          <el-icon><View /></el-icon>
          {{ t('actions.mine.awaitingReview', { n: reviewCount }) }}
        </el-tag>
      </div>

      <div v-if="!error" class="app-toolbar my-actions__toolbar">
        <el-select v-model="status" class="my-actions__filter" :placeholder="t('actions.mine.filterStatus')" clearable>
          <el-option value="" :label="`${t('common.labels.all')} · ${items.length}`" />
          <el-option
            v-for="s in statusCounts"
            :key="s.value"
            :value="s.value"
            :label="`${t(`enums.actionStatus.${s.value}`)} · ${s.n}`"
          />
        </el-select>
        <el-select v-model="type" class="my-actions__filter" :placeholder="t('actions.mine.anyType')" clearable filterable>
          <el-option value="" :label="t('actions.mine.anyType')" />
          <el-option v-for="ty in types" :key="ty.value" :value="ty.value" :label="ty.label" />
        </el-select>
        <el-checkbox v-model="showChat" :label="t('actions.mine.showChat')" border />
        <span class="app-toolbar__spacer" />
        <el-radio-group v-model="order" size="default">
          <el-radio-button value="newest">{{ t('actions.mine.sort.newest') }}</el-radio-button>
          <el-radio-button value="oldest">{{ t('actions.mine.sort.oldest') }}</el-radio-button>
        </el-radio-group>
      </div>

      <el-alert v-if="more && !loading" type="info" show-icon :closable="false" class="my-actions__capped">
        <span>{{ t('actions.mine.capped', { n: items.length }) }}</span>
        <el-button link type="primary" @click="load(false)">{{ t('actions.mine.loadRest') }}</el-button>
      </el-alert>
      <p v-if="loading && items.length" class="my-actions__loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        {{ t('actions.mine.loadingAll', { n: items.length }) }}
      </p>

      <AsyncState
        :loading="loading && !items.length"
        :error="error"
        :empty="!filtered.length"
        :empty-text="items.length ? t('actions.mine.emptyFiltered') : t('actions.mine.empty')"
        @retry="load(true)"
      >
        <el-table ref="tableRef" :data="shown" row-key="id" class="my-actions__table" @row-click="open">
          <el-table-column :label="t('actions.mine.columns.action')" min-width="260">
            <template #default="{ row }">
              <div class="my-actions__cell">
                <router-link
                  :to="{ name: 'course-action', params: { courseId, actionId: row.id } }"
                  class="my-actions__type"
                  @click.stop
                >
                  {{ typeLabel(row.action_type) }}
                </router-link>
                <ActionTarget :action="row" :course-id="courseId" />
                <RevisesLine v-if="row.revises_action_id" :course-id="courseId" :action-id="row.revises_action_id" />
                <p
                  v-if="outcomeNote(row)"
                  class="my-actions__note"
                  :class="{ 'is-error': row.status === 'failed' || row.status === 'denied' }"
                >
                  {{ outcomeNote(row) }}
                </p>
                <div v-if="narrow" class="my-actions__stack">
                  <StatusTag vocab="actionStatus" :value="row.status" />
                  <StatusTag v-if="row.review_state !== 'none'" vocab="reviewState" :value="row.review_state" />
                  <span class="my-actions__muted"><TimeText :value="row.created_at" relative /></span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('actions.mine.columns.status')" min-width="150">
            <template #default="{ row }">
              <div class="my-actions__tags">
                <StatusTag vocab="actionStatus" :value="row.status" />
                <StatusTag v-if="row.review_state !== 'none'" vocab="reviewState" :value="row.review_state" />
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('actions.mine.columns.created')" min-width="130">
            <template #default="{ row }">
              <TimeText :value="row.created_at" relative />
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('actions.mine.columns.decided')" min-width="170">
            <template #default="{ row }">
              <div v-if="row.decided_at || row.decided_by_member_id" class="my-actions__decided">
                <ActionActor v-if="row.decided_by_member_id" :member-id="row.decided_by_member_id" />
                <span class="my-actions__muted"><TimeText :value="row.decided_at" relative /></span>
              </div>
              <span v-else class="my-actions__muted">—</span>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="filtered.length > PER_PAGE" class="my-actions__pager">
          <el-pagination
            v-model:current-page="page"
            :page-size="PER_PAGE"
            :total="filtered.length"
            layout="prev, pager, next"
            :pager-count="narrow ? 5 : 7"
            size="small"
            background
          />
        </div>
      </AsyncState>
    </div>
  </div>
</template>

<style scoped>
.my-actions__help {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.my-actions__summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.my-actions__summary .el-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.my-actions__chip {
  cursor: pointer;
}
.my-actions__filter {
  width: 200px;
}
@media (max-width: 600px) {
  .my-actions__filter {
    width: 100%;
  }
}
.my-actions__capped {
  margin-bottom: 12px;
}
.my-actions__loading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
}
.my-actions__table :deep(.el-table__row) {
  cursor: pointer;
}
.my-actions__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  min-width: 0;
}
.my-actions__type {
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-decoration: none;
}
.my-actions__type:hover {
  color: var(--el-color-primary);
}
.my-actions__note {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--el-color-warning);
  word-break: break-word;
}
.my-actions__note.is-error {
  color: var(--el-color-danger);
}
.my-actions__stack,
.my-actions__tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.my-actions__decided {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.my-actions__muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.my-actions__pager {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}
</style>
