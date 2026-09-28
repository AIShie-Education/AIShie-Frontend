<script setup lang="ts">
// What is waiting for the caller: proposals to decide and actions to review
// (for a seat with action_decide, or, for a person without it who owns an agent
// seated here, their own agents'), and draft grades not yet released (for a
// seat that posts grades and reads them). A queue the seat turns out not to
// be allowed to read is left out; if none is left, so is the card. In an
// archived course nothing can be decided or posted any more, so nothing is
// waiting for anyone and the card is not shown.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { ApiError, read } from '@/api/http'
import { toApiError, useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import TimeText from '@/components/TimeText.vue'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const { t } = useI18n()

const PAGE = 200
/** How far the drafts are looked for: grade.list has no filter by state. */
const DRAFT_PAGES = 25
const decides = computed(() => course.writable && course.can('action_decide'))
/** A person who decides nothing else here, whose own agents' proposals and reviews the queues show them. */
const ownersQueue = computed(() => course.writable && !course.can('action_decide') && course.ownsAgentHere === true)
// grade.list is gated by grade_read; drafts are among what it lists for a seat that posts.
const posts = computed(() => course.writable && course.can('grade_post') && course.can('grade_read'))

interface Count {
  n: number
  /** There may be more than n: the list was not read to its end. */
  more: boolean
  /** When the oldest thing waiting began to wait. */
  oldest: string | null
}
function count(list: { created_at: string }[], more: boolean): Count {
  const oldest = list.reduce<string | null>((o, x) => (!o || x.created_at < o ? x.created_at : o), null)
  return { n: list.length, more, oldest }
}

// Both action queues hold only what is waiting, so one page says "12" or
// "200+". They are behind action_decide: the second is asked for only once
// the first has been allowed, so a seat whose levels are unknown is refused
// once, not twice.
const queues = useAsync<{ proposals: Count; reviews: Count | ApiError } | null>(
  async () => {
    if (!decides.value && !ownersQueue.value) return null
    const p = await read('action.list_proposed', { course_id: props.courseId, limit: PAGE })
    let reviews: Count | ApiError
    try {
      const r = await read('action.list_pending_review', { course_id: props.courseId, limit: PAGE })
      reviews = count(r.actions ?? [], !!r.next)
    } catch (e) {
      reviews = toApiError(e)
    }
    return { proposals: count(p.actions ?? [], !!p.next), reviews }
    // Whether the caller owns an agent here is learnt as the course opens.
  },
  { watch: [ownersQueue] },
)
// grade.list gives every grade the seat may see, oldest first — posted,
// superseded and computed ones too, and each regrade or new draft adds one —
// so the live drafts may be anywhere in it: it is read to its end, up to
// DRAFT_PAGES pages, and a count cut short there says "n+".
const drafts = useAsync<Count | null>(async () => {
  if (!posts.value) return null
  const found: { created_at: string }[] = []
  let after: string | undefined
  for (let i = 0; i < DRAFT_PAGES; i++) {
    const out = await read('grade.list', { course_id: props.courseId, limit: PAGE, after })
    for (const g of out.grades ?? []) if (g.state === 'draft') found.push(g)
    if (!out.next) return count(found, false)
    after = out.next
  }
  return count(found, true)
})

interface Row {
  key: string
  icon: string
  label: string
  oldestLabel: string
  to: RouteLocationRaw
  loading: boolean
  error: ApiError | null
  data: Count | null
  /** Said under a count that was cut short. */
  partial?: string
}
const rows = computed<Row[]>(() => {
  const approvals = (tab?: 'review'): RouteLocationRaw => ({
    name: 'course-approvals',
    params: { courseId: props.courseId },
    query: tab ? { tab } : undefined,
  })
  const q = queues.data.value
  const reviewsOut = q?.reviews
  const out: Row[] = []
  if (decides.value || ownersQueue.value) {
    const agents = !decides.value
    out.push({
      key: 'proposals',
      icon: 'Stamp',
      label: agents ? t('overview.attention.agentProposals') : t('overview.attention.proposals'),
      oldestLabel: t('overview.attention.oldestProposal'),
      to: approvals(),
      loading: queues.loading.value,
      error: queues.error.value,
      data: q?.proposals ?? null,
    })
    out.push({
      key: 'reviews',
      icon: 'View',
      label: agents ? t('overview.attention.agentReviews') : t('overview.attention.reviews'),
      oldestLabel: t('overview.attention.oldestReview'),
      to: approvals('review'),
      loading: queues.loading.value,
      error: queues.error.value ?? (reviewsOut instanceof ApiError ? reviewsOut : null),
      data: reviewsOut && !(reviewsOut instanceof ApiError) ? reviewsOut : null,
    })
  }
  if (posts.value) {
    out.push({
      key: 'drafts',
      icon: 'Medal',
      label: t('overview.attention.drafts'),
      oldestLabel: t('overview.attention.oldestDraft'),
      to: { name: 'course-grades', params: { courseId: props.courseId } },
      loading: drafts.loading.value,
      error: drafts.error.value,
      data: drafts.data.value ?? null,
      partial: t('overview.attention.draftsPartial', { n: PAGE * DRAFT_PAGES }),
    })
  }
  // A refusal means the queue is not this seat's to look at.
  return out.filter((r) => !(r.error && r.error.isForbidden))
})
const loading = computed(() => rows.value.some((r) => r.loading))
const allClear = computed(() => !loading.value && rows.value.every((r) => !r.error && r.data?.n === 0 && !r.data.more))
function reloadAll() {
  if (decides.value) void queues.reload()
  if (posts.value) void drafts.reload()
}
</script>

<template>
  <section v-if="rows.length" class="app-card attention">
    <h2 class="app-card__title">
      <span>{{ t('overview.attention.title') }}</span>
      <el-button link :loading="loading" :aria-label="t('common.actions.refresh')" @click="reloadAll">
        <el-icon v-if="!loading"><Refresh /></el-icon>
      </el-button>
    </h2>
    <p v-if="allClear" class="attention__clear">
      <el-icon><CircleCheck /></el-icon>
      <span>{{ t('overview.attention.allClear') }}</span>
    </p>
    <div class="attention__rows">
      <router-link
        v-for="r in rows"
        :key="r.key"
        :to="r.to"
        class="attention__row"
        :class="{ 'is-waiting': !!r.data && (r.data.n > 0 || r.data.more) }"
      >
        <span class="attention__icon"
          ><el-icon><component :is="r.icon" /></el-icon
        ></span>
        <span class="attention__text">
          <span class="attention__label">{{ r.label }}</span>
          <span v-if="r.error" class="attention__sub attention__sub--error">
            {{ t('overview.attention.failed') }}
          </span>
          <template v-else>
            <span v-if="r.data?.oldest" class="attention__sub">
              {{ r.oldestLabel }} <TimeText :value="r.data.oldest" relative />
            </span>
            <span v-if="r.data?.more && r.partial" class="attention__sub">{{ r.partial }}</span>
          </template>
        </span>
        <span class="attention__count">
          <el-icon v-if="r.loading" class="is-loading"><Loading /></el-icon>
          <template v-else-if="r.error">—</template>
          <template v-else-if="r.data">
            {{ r.data.more ? t('overview.attention.atLeast', { n: r.data.n }) : r.data.n }}
          </template>
        </span>
        <el-icon class="attention__go"><ArrowRight /></el-icon>
      </router-link>
    </div>
  </section>
</template>

<style scoped>
.attention__clear {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-color-success);
}
.attention__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.attention__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--app-radius-item);
  border: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-primary);
  text-decoration: none;
  min-width: 0;
}
.attention__row:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-lighter);
}
.attention__row.is-waiting {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
}
.attention__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}
.attention__row.is-waiting .attention__icon {
  color: var(--el-color-warning);
  background: var(--el-bg-color);
}
.attention__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.attention__label {
  font-size: 14px;
  font-weight: 500;
}
.attention__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.attention__sub--error {
  color: var(--el-color-danger);
}
.attention__count {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  min-width: 2ch;
  text-align: right;
}
.attention__row.is-waiting .attention__count {
  color: var(--el-color-warning-dark-2, var(--el-color-warning));
}
.attention__go {
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
</style>
