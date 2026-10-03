<script setup lang="ts">
// The course's event feed (event.list), newest first. It opens on the newest
// window of events (see feed.ts for how the head is found when Core only
// reads forward), loads older ones on request, and checks for news every
// POLL_MS while the page is visible, highlighting what arrived. Everything
// shown is what Core decided this seat may know about: event types by
// permission, rows by student and assignment scope, and always the events of
// the caller's own actions. Each event says who acted where the caller may
// read the action it was done under (EventItem, actors.ts): any, for those
// who decide actions; their own and their own agents', for anyone else. The
// Agents chip keeps what agents did or proposed, for those who decide
// actions and for those who own an agent here.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import type { ApiError } from '@/api/http'
import { toApiError } from '@/composables/useAsync'
import { notifyError } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import EventItem from './components/EventItem.vue'
import { ensureEventWho, eventActor } from './components/actors'
import {
  CATEGORIES,
  CATEGORY_ICON,
  categoryOf,
  eventsSince,
  hasOlder,
  mergeNewestFirst,
  newestWindow,
  olderWindow,
  runsOf,
  whoReachOf,
  type Category,
  type Run,
  type CourseEvent,
} from './components/feed'
import { joinParts } from '@/utils/parts'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

/** A window of at least WANT events and fewer than LIMIT is read at a time. */
const WANT = 60
const LIMIT = 200
const POLL_MS = 30_000
/** Older windows are read on their own, a few at most, until this many rows can be shown. */
const MIN_ROWS = 20
const AUTO_LOADS = 4

const events = ref<CourseEvent[]>([]) // newest first
const floor = ref(0)
const head = ref(0)
const loaded = ref(false)
const loading = ref(false)
const error = ref<ApiError | null>(null)
const olderLoading = ref(false)
const fresh = ref<Set<number>>(new Set())
const checking = ref(false)
const checkError = ref<ApiError | null>(null)
const lastChecked = ref<string | null>(null)
const visible = ref(typeof document === 'undefined' || document.visibilityState === 'visible')
const selected = ref<Category[]>([])

let generation = 0
let disposed = false

async function load() {
  const mine = ++generation
  loading.value = true
  error.value = null
  void course.ensureAssignments()
  try {
    const w = await newestWindow(props.courseId, { want: WANT, limit: LIMIT })
    const older = await hasOlder(props.courseId, w.floor)
    if (mine !== generation || disposed) return
    events.value = [...w.events].reverse()
    floor.value = older ? w.floor : 0
    head.value = w.head
    fresh.value = new Set()
    checkError.value = null
    lastChecked.value = new Date().toISOString()
    loaded.value = true
  } catch (e) {
    if (mine === generation && !disposed) error.value = toApiError(e)
  } finally {
    if (mine === generation && !disposed) loading.value = false
  }
  if (mine === generation && loaded.value) await fillUp()
}

/** Loads older windows while there is too little to show (a burst of one thing collapses to a row). */
async function fillUp() {
  for (let i = 0; i < AUTO_LOADS && floor.value > 0 && !disposed && runCount(events.value) < MIN_ROWS; i++) {
    if (!(await loadOlder())) return
  }
}

async function older() {
  if (await loadOlder()) await fillUp()
}

async function loadOlder(): Promise<boolean> {
  if (olderLoading.value || floor.value <= 0) return false
  const mine = generation
  olderLoading.value = true
  try {
    const w = await olderWindow(props.courseId, events.value, floor.value, { want: WANT, limit: LIMIT })
    const older = await hasOlder(props.courseId, w.floor)
    if (mine !== generation || disposed) return false
    events.value = mergeNewestFirst(events.value, w.events)
    floor.value = older ? w.floor : 0
    return true
  } catch (e) {
    if (mine === generation && !disposed) notifyError(e, t('activity.olderFailed'))
    return false
  } finally {
    if (!disposed) olderLoading.value = false
  }
}

/** Reads what has happened since the head, and marks it as new. */
async function check() {
  if (!loaded.value || checking.value) return
  const mine = generation
  checking.value = true
  try {
    const out = await eventsSince(props.courseId, head.value)
    if (mine !== generation || disposed) return
    if (out.events.length) {
      events.value = mergeNewestFirst(events.value, out.events)
      const next = new Set(fresh.value)
      for (const e of out.events) next.add(e.seq)
      fresh.value = next
    }
    head.value = out.head
    checkError.value = null
    lastChecked.value = new Date().toISOString()
  } catch (e) {
    if (mine === generation && !disposed) checkError.value = toApiError(e)
  } finally {
    if (!disposed) checking.value = false
  }
}

function refresh() {
  if (loaded.value) void check()
  else void load()
}

function markSeen() {
  fresh.value = new Set()
}

// Polling: Core never calls out. Nothing new can happen in an archived course.
const live = computed(() => loaded.value && !course.archived)
let timer: ReturnType<typeof setInterval> | undefined
function onVisibility() {
  visible.value = document.visibilityState === 'visible'
  if (!visible.value || !live.value) return
  const since = lastChecked.value ? Date.now() - new Date(lastChecked.value).getTime() : Infinity
  if (since >= POLL_MS) void check()
}
onMounted(() => {
  void load()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && live.value) void check()
  }, POLL_MS)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  disposed = true
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisibility)
})

// Filtering by family of event.
const counts = computed(() => {
  const c: Record<Category, number> = {
    grades: 0,
    submissions: 0,
    assignments: 0,
    documents: 0,
    members: 0,
    actions: 0,
    course: 0,
    other: 0,
  }
  for (const e of events.value) c[categoryOf(e.type)]++
  return c
})
const chips = computed<Category[]>(() => (counts.value.other ? [...CATEGORIES, 'other'] : CATEGORIES))
function toggle(c: Category) {
  selected.value = selected.value.includes(c) ? selected.value.filter((x) => x !== c) : [...selected.value, c]
}
// What agents did or proposed: who acted is read from each event's action, where the
// caller may read it (actors.ts); every loaded event's is read. Only a seat that decides
// actions, or owns an agent here, can learn that an agent did anything.
const whoReach = computed(() => whoReachOf(course))
const agentsChip = computed(() => whoReach.value.decides || whoReach.value.ownsAgent)
const byAgents = ref(false)
watch(
  [events, whoReach],
  () => {
    if (whoReach.value.decides) void course.ensureMembers()
    for (const e of events.value) ensureEventWho(props.courseId, e, whoReach.value)
  },
  { immediate: true },
)
function byAgent(e: CourseEvent): boolean {
  const a = eventActor(props.courseId, e, whoReach.value)
  return !!a?.id && (a.agent || course.members.get(a.id)?.kind === 'agent')
}
const agentCount = computed(() => (agentsChip.value ? events.value.filter(byAgent).length : 0))
function showAll() {
  selected.value = []
  byAgents.value = false
}
const shown = computed(() => {
  const list = selected.value.length
    ? events.value.filter((e) => selected.value.includes(categoryOf(e.type)))
    : events.value
  return byAgents.value && agentsChip.value ? list.filter(byAgent) : list
})
const freshCount = computed(() => fresh.value.size)

// Grouped by day, in the reader's language. Within a day, a run of the same
// thing happening to the same subject (see sameRun) is one row that opens to
// show them all. New and seen events are never put in one run.
interface Day {
  key: string
  label: string
  events: CourseEvent[]
}
const expanded = ref<Set<number>>(new Set())
const apart = (a: CourseEvent, b: CourseEvent) => fresh.value.has(a.seq) !== fresh.value.has(b.seq)
function runCount(list: CourseEvent[]): number {
  return runsOf(list, apart).length
}
function toggleRun(key: number) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
const days = computed<(Day & { runs: Run[] })[]>(() => {
  void ui.locale
  const today = dayjs().startOf('day')
  const out: Day[] = []
  for (const e of shown.value) {
    const d = dayjs(e.occurred_at)
    const key = d.format('YYYY-MM-DD')
    let day = out[out.length - 1]
    if (!day || day.key !== key) {
      const diff = today.diff(d.startOf('day'), 'day')
      const label =
        diff === 0
          ? t('activity.today')
          : diff === 1
            ? t('activity.yesterday')
            : joinParts([d.format('LL'), d.format('ddd')])
      day = { key, label, events: [] }
      out.push(day)
    }
    day.events.push(e)
  }
  return out.map((d) => ({ ...d, runs: runsOf(d.events, apart) }))
})
</script>

<template>
  <div class="activity">
    <PageHeader :title="t('activity.title')" :subtitle="t('activity.subtitle')">
      <el-button :loading="checking || (loading && !loaded)" @click="refresh">
        <el-icon v-if="!(checking || (loading && !loaded))"><Refresh /></el-icon>
        <span>{{ t('activity.refresh') }}</span>
      </el-button>
    </PageHeader>

    <AsyncState :loading="loading && !loaded" :error="error" @retry="load">
      <div class="app-card activity__card">
        <div class="activity__status">
          <span
            class="activity__dot"
            :class="{ 'is-live': live && visible && !checkError, 'is-error': !!checkError }"
            aria-hidden="true"
          />
          <span v-if="course.archived" class="app-muted">{{ t('activity.archived') }}</span>
          <span v-else-if="checkError" class="activity__status-error">{{ t('activity.checkFailed') }}</span>
          <span v-else-if="!visible" class="app-muted">{{ t('activity.paused') }}</span>
          <span v-else class="app-muted">{{ t('activity.live', { n: POLL_MS / 1000 }) }}</span>
          <span v-if="lastChecked" class="activity__checked app-muted">
            {{ t('activity.lastChecked') }} <TimeText :value="lastChecked" relative />
          </span>
        </div>

        <div class="activity__chips" role="group" :aria-label="t('activity.filterLabel')">
          <el-check-tag :checked="selected.length === 0 && !byAgents" class="activity__chip" @change="showAll">
            {{ t('activity.filter.all') }}
            <span class="activity__chip-count">{{ events.length }}</span>
          </el-check-tag>
          <el-check-tag
            v-for="c in chips"
            :key="c"
            :checked="selected.includes(c)"
            class="activity__chip"
            :class="{ 'is-zero': !counts[c] }"
            @change="toggle(c)"
          >
            <el-icon><component :is="CATEGORY_ICON[c]" /></el-icon>
            {{ t(`activity.filter.${c}`) }}
            <span class="activity__chip-count">{{ counts[c] }}</span>
          </el-check-tag>
          <!-- What agents did or proposed, with whatever family is chosen. -->
          <el-check-tag
            v-if="agentsChip"
            :checked="byAgents"
            class="activity__chip activity__chip--agents"
            :class="{ 'is-zero': !agentCount }"
            @change="byAgents = !byAgents"
          >
            <el-icon><AgentSeatIcon /></el-icon>
            {{ t('activity.filter.agents') }}
            <span class="activity__chip-count">{{ agentCount }}</span>
          </el-check-tag>
        </div>

        <div v-if="freshCount" class="activity__fresh">
          <el-icon><BellFilled /></el-icon>
          <span>{{ t('activity.freshBanner', { n: freshCount }) }}</span>
          <el-button link type="primary" @click="markSeen">{{ t('activity.markSeen') }}</el-button>
        </div>

        <el-empty v-if="!events.length" :description="t('activity.empty')" />
        <el-empty v-else-if="!shown.length" :description="t('activity.emptyFiltered')" :image-size="80" />

        <section v-for="day in days" :key="day.key" class="activity__day">
          <h3 class="activity__day-title">{{ day.label }}</h3>
          <template v-for="run in day.runs" :key="run.key">
            <EventItem
              v-for="e in expanded.has(run.key) ? run.events : run.events.slice(0, 1)"
              :key="e.seq"
              :event="e"
              :course-id="courseId"
              :fresh="fresh.has(e.seq)"
            />
            <div v-if="run.events.length > 1" class="activity__run">
              <el-button link type="primary" size="small" @click="toggleRun(run.key)">
                <el-icon><component :is="expanded.has(run.key) ? 'ArrowUp' : 'ArrowDown'" /></el-icon>
                <span>
                  {{
                    expanded.has(run.key) ? t('activity.runLess') : t('activity.runMore', { n: run.events.length - 1 })
                  }}
                </span>
                <span v-if="!expanded.has(run.key)" class="activity__run-since app-muted"
                  >{{ t('common.sep')
                  }}<i18n-t keypath="activity.runSince" scope="global"
                    ><template #time
                      ><TimeText :value="run.events[run.events.length - 1].occurred_at" relative /></template></i18n-t
                ></span>
              </el-button>
            </div>
          </template>
        </section>

        <LoadMore :has-more="floor > 0" :loading="olderLoading" @more="older" />
        <p v-if="events.length && floor <= 0" class="activity__end app-muted">{{ t('activity.beginning') }}</p>
      </div>
      <p class="activity__note app-muted">{{ t('activity.note') }}</p>
    </AsyncState>
  </div>
</template>

<style scoped>
.activity__card {
  padding-top: 14px;
}
.activity__status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--app-text-sm);
  margin-bottom: 12px;
}
.activity__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
.activity__dot.is-live {
  background: var(--el-color-success);
  box-shadow: 0 0 0 3px var(--el-color-success-light-8);
}
.activity__dot.is-error {
  background: var(--el-color-danger);
}
.activity__status-error {
  color: var(--el-color-danger);
}
.activity__checked {
  margin-left: auto;
}
.activity__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.activity__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.activity__chip :deep(.el-icon) {
  vertical-align: -2px;
}
/* A category with nothing in it: outlined, not filled, its words as legible as the others'. */
.activity__chip.is-zero:not(.is-checked) {
  background-color: transparent;
  box-shadow: inset 0 0 0 1px var(--app-line-strong);
}
.activity__chip-count {
  font-variant-numeric: tabular-nums;
  font-size: var(--app-text-xs);
  font-weight: 400;
  margin-left: 2px;
}
.activity__fresh {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: var(--app-radius-item);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: var(--app-text-sm);
}
.activity__day {
  margin-top: 8px;
}
.activity__day-title {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 8px 0 2px;
  padding: 6px 0;
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
}
.activity__run {
  margin: -6px 0 6px 54px;
}
.activity__run-since {
  margin-left: 4px;
  font-weight: normal;
}
.activity__end {
  text-align: center;
  font-size: var(--app-text-sm);
  margin: 16px 0 4px;
}
.activity__note {
  font-size: var(--app-text-xs);
  margin: 12px 4px 0;
  line-height: var(--app-lh-ui);
}
</style>
