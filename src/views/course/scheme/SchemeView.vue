<script setup lang="ts">
// The course's grading scheme: the tree of components from the course total
// down (component.tree), with the assignments hung on each, and, for those
// who may set it up (assignment_write), adding, editing and moving
// components (component.create / update / move). Reading it needs grade_read.
//
// Which parts can no longer change is read from the grades entered so far
// (grade.list): once a grade has been entered beneath a component its place
// is fixed, and once one is entered on a directly graded component its points
// are. Those are shown before the person tries; Core refuses them regardless.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import ComponentDialog from './components/ComponentDialog.vue'
import MoveDialog from './components/MoveDialog.vue'
import SchemeHelp from './components/SchemeHelp.vue'
import SchemeTree from './components/SchemeTree.vue'
import {
  addGrades,
  buildScheme,
  childBlock,
  emptyFacts,
  pct,
  SEGMENT_COLORS,
  type AssignmentsSeen,
  type GradeFacts,
  type SchemeNode,
} from './components/schemeModel'
import { formatDecimal, formatList } from '@/utils/format'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const { t } = useI18n()

// --- The tree and the assignments hung on it -------------------------------
const { data, error, loading, reload } = useAsync(() => read('component.tree', { course_id: props.courseId }), {
  keepData: true,
})
onMounted(() => void course.ensureAssignments())

// assignment.list answers only what is within the caller's assignment scope,
// and unpublished assignments only to those who may write them. Where the list
// may be short, a leaf that shows none may still hold some.
const seen = computed<AssignmentsSeen>(() => {
  const scope = course.seat?.assignment_scope ?? course.membership?.assignment_scope
  const counted = course.assignmentsState === 'loaded' && scope === 'all'
  return { counted, all: counted && course.can('assignment_write') }
})
/** Until the assignments have been read (or could not be), which components hold some is not known yet. */
const assignmentsSettled = computed(() => course.assignmentsState !== 'idle' && course.assignmentsState !== 'loading')

const scheme = computed(() => buildScheme(data.value?.components, [...course.assignments.values()], seen.value))
const componentCount = computed(() => scheme.value.nodes.length)

const canWrite = computed(() => course.can('assignment_write'))
const needsApproval = computed(() => course.needsApproval('assignment_write'))
const writable = computed(() => course.writable)

// --- What the grades entered so far freeze ---------------------------------
const MAX_GRADE_PAGES = 25
const facts = ref<GradeFacts | null>(null)
const factsState = ref<'idle' | 'loading' | 'done' | 'failed'>('idle')
let factsGeneration = 0

async function loadFacts() {
  const mine = ++factsGeneration
  if (!canWrite.value || !writable.value) {
    facts.value = null
    factsState.value = 'idle'
    return
  }
  factsState.value = 'loading'
  const f = emptyFacts()
  let after: string | undefined
  let allPages = false
  try {
    for (let page = 0; page < MAX_GRADE_PAGES; page++) {
      const out = await read('grade.list', { course_id: props.courseId, limit: 200, after })
      if (mine !== factsGeneration) return
      addGrades(f, out.grades)
      if (!out.next) {
        allPages = true
        break
      }
      after = out.next
    }
    // grade.list shows drafts only to those who grade, and only within the caller's scopes.
    f.complete = allPages && course.seesAllGrades
    facts.value = f
    factsState.value = 'done'
  } catch {
    if (mine !== factsGeneration) return
    facts.value = null
    factsState.value = 'failed'
  }
}
// Once the tree has been read (a caller refused it has nothing to edit), and
// again if what the caller may do changes.
watch(
  [() => !!data.value, canWrite, writable],
  ([loaded]) => {
    if (loaded) void loadFacts()
  },
  { immediate: true },
)

function refresh() {
  void reload().then(() => {
    if (data.value) void loadFacts()
  })
  course.invalidate('assignments')
  void course.ensureAssignments()
}

// --- The course total at a glance -------------------------------------------
interface Segment {
  key: string
  name: string
  share: number
  color: string
}
const segments = computed<Segment[]>(() => {
  const root = scheme.value.root
  if (!root) return []
  const parts =
    root.kind === 'bucket'
      ? root.assignments.map((x) => ({ key: x.a.id, name: x.a.title, share: x.share }))
      : root.children.map((c) => ({ key: c.id, name: c.c.name, share: c.share }))
  return parts
    .filter((p): p is { key: string; name: string; share: number } => p.share !== null && p.share > 0)
    .map((p, i) => ({ ...p, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]! }))
})
const glanceEmpty = computed(() => {
  const root = scheme.value.root
  if (!root || root.kind === 'empty') return 'none'
  // Assignments hung on the course total itself, not all of them shown.
  if (root.kind === 'unseen' || (root.kind === 'bucket' && !seen.value.counted)) return 'unseen'
  return segments.value.length ? null : 'zero'
})

// --- Editing -----------------------------------------------------------------
const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const dialogTarget = ref<SchemeNode | null>(null)
const moveOpen = ref(false)
const moveTarget = ref<SchemeNode | null>(null)
const proposed = ref(false)

const addable = computed(() => scheme.value.nodes.some((n) => !childBlock(n)))

// The tree is rebuilt on every read; an open dialog follows its component into the new one.
watch(scheme, (s) => {
  if (dialogTarget.value) dialogTarget.value = s.byId.get(dialogTarget.value.id) ?? dialogTarget.value
  if (moveTarget.value) moveTarget.value = s.byId.get(moveTarget.value.id) ?? moveTarget.value
})

function openCreate(parent: SchemeNode | null) {
  dialogMode.value = 'create'
  dialogTarget.value = parent ?? scheme.value.root
  dialogOpen.value = true
}
function openEdit(n: SchemeNode) {
  dialogMode.value = 'edit'
  dialogTarget.value = n
  dialogOpen.value = true
}
function openMove(n: SchemeNode) {
  moveTarget.value = n
  moveOpen.value = true
}
function onDone(status: 'executed' | 'proposed') {
  if (status === 'proposed') proposed.value = true
  void reload()
}
/** Core refused a change by one of its rules: read again what the page knows, so that it shows why. */
function onRefused() {
  refresh()
}

const collapsed = ref<Set<string>>(new Set())
function expandAll() {
  collapsed.value = new Set()
}
function collapseAll() {
  // Keep the course total open so its top level stays in view.
  collapsed.value = new Set(
    scheme.value.nodes.filter((n) => !n.isRoot && (n.children.length || n.assignments.length)).map((n) => n.id),
  )
}
</script>

<template>
  <div class="scheme-view">
    <PageHeader :title="t('scheme.title')" :subtitle="t('scheme.subtitle')">
      <el-button :loading="loading" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>{{ t('common.actions.refresh') }}</span>
      </el-button>
      <el-tooltip
        v-if="canWrite && !error"
        :content="t('common.archivedCourse')"
        :disabled="writable"
        placement="bottom"
      >
        <span class="scheme-view__add">
          <el-button
            type="primary"
            :disabled="!writable || !data || !assignmentsSettled || !addable"
            @click="openCreate(null)"
          >
            <el-icon><Plus /></el-icon>
            <span>{{ t('scheme.actions.addComponent') }}</span>
          </el-button>
          <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
        </span>
      </el-tooltip>
    </PageHeader>

    <AppNote v-if="proposed" class="scheme-view__notice" @close="proposed = false" closable>
      {{ t('scheme.outcome.proposed') }}
      <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
        t('scheme.outcome.viewMine')
      }}</router-link>
    </AppNote>

    <AsyncState
      :loading="loading"
      :overlay="!!data"
      :error="error"
      :empty="!!data && !scheme.root"
      :empty-text="t('scheme.empty')"
      @retry="reload"
    >
      <template v-if="scheme.root">
        <!-- The course total at a glance -->
        <section class="app-card">
          <h2 class="app-card__title">
            <span class="scheme-view__heading">
              <el-icon><Trophy /></el-icon>
              {{ t('scheme.glance.title') }}
            </span>
          </h2>
          <p v-if="glanceEmpty" class="app-muted scheme-view__glance-empty">{{ t(`scheme.glance.${glanceEmpty}`) }}</p>
          <template v-else>
            <div
              class="glance-bar"
              role="img"
              :aria-label="formatList(segments.map((s) => t('common.pair', { label: s.name, value: pct(s.share) })))"
            >
              <span
                v-for="s in segments"
                :key="s.key"
                class="glance-bar__seg"
                :style="{ flexGrow: s.share, background: s.color }"
                :title="`${s.name} · ${pct(s.share)}`"
              />
            </div>
            <ul class="glance-legend">
              <li v-for="s in segments" :key="s.key">
                <span class="glance-legend__dot" :style="{ background: s.color }" />
                <span class="glance-legend__name">{{ s.name }}</span>
                <span class="glance-legend__pct">{{ pct(s.share) }}</span>
              </li>
            </ul>
          </template>
        </section>

        <!-- The tree -->
        <section class="app-card">
          <h2 class="app-card__title">
            <span class="scheme-view__heading">
              <el-icon><Share /></el-icon>
              {{ t('scheme.tree.title') }}
              <span class="app-muted scheme-view__count">{{
                t('scheme.tree.count', { n: componentCount }, componentCount)
              }}</span>
            </span>
            <span class="scheme-view__tree-tools">
              <el-button text size="small" @click="expandAll">{{ t('scheme.actions.expandAll') }}</el-button>
              <el-button text size="small" @click="collapseAll">{{ t('scheme.actions.collapseAll') }}</el-button>
            </span>
          </h2>

          <div class="scheme-view__notes">
            <p v-if="factsState === 'loading'" class="scheme-view__note">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>{{ t('scheme.tree.checking') }}</span>
            </p>
            <p v-else-if="factsState === 'failed'" class="scheme-view__note">
              <el-icon><Warning /></el-icon>
              <span>{{ t('scheme.tree.factsFailed') }}</span>
            </p>
            <p v-else-if="factsState === 'done' && facts && !facts.complete" class="scheme-view__note">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ t('scheme.tree.partial') }}</span>
            </p>
            <p v-if="course.assignmentsState === 'loaded' && !seen.counted" class="scheme-view__note">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ t('scheme.tree.assignmentsPartial') }}</span>
            </p>
            <p v-else-if="course.assignmentsState === 'forbidden'" class="scheme-view__note">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ t('scheme.tree.assignmentsHidden') }}</span>
            </p>
            <p v-else-if="course.assignmentsState === 'error'" class="scheme-view__note">
              <el-icon><Warning /></el-icon>
              <span>
                {{ t('scheme.tree.assignmentsFailed') }}
                <el-button link type="primary" class="scheme-view__retry" @click="course.ensureAssignments()">
                  {{ t('common.actions.retry') }}
                </el-button>
              </span>
            </p>
          </div>

          <SchemeTree
            v-model:collapsed="collapsed"
            :scheme="scheme"
            :course-id="courseId"
            :facts="facts"
            :can-write="canWrite"
            :writable="writable && assignmentsSettled"
            @add="openCreate"
            @edit="openEdit"
            @move="openMove"
          />
        </section>

        <!-- Assignments that count toward nothing -->
        <section v-if="scheme.uncounted.length" class="app-card">
          <h2 class="app-card__title">
            <span class="scheme-view__heading">
              <el-icon><Tickets /></el-icon>
              {{ t('scheme.uncounted.title') }}
            </span>
          </h2>
          <p class="app-muted scheme-view__uncounted-help">{{ t('scheme.uncounted.help') }}</p>
          <ul class="uncounted">
            <li v-for="a in scheme.uncounted" :key="a.id">
              <el-icon class="uncounted__icon"><Document /></el-icon>
              <router-link
                :to="{ name: 'course-assignment', params: { courseId, assignmentId: a.id } }"
                class="uncounted__title"
              >
                {{ a.title }}
              </router-link>
              <AppTag v-if="!a.published_at" tone="wait">{{ t('scheme.tree.unpublished') }}</AppTag>
              <span class="uncounted__points">{{
                t(
                  'scheme.uncounted.points',
                  { n: formatDecimal(a.points_possible, 4) },
                  Number(a.points_possible) === 1 ? 1 : 2,
                )
              }}</span>
            </li>
          </ul>
        </section>

        <SchemeHelp />
      </template>
    </AsyncState>

    <ComponentDialog
      v-model="dialogOpen"
      :mode="dialogMode"
      :course-id="courseId"
      :scheme="scheme"
      :target="dialogTarget"
      :facts="facts"
      :needs-approval="needsApproval"
      @done="onDone"
      @refused="onRefused"
    />
    <MoveDialog
      v-model="moveOpen"
      :course-id="courseId"
      :scheme="scheme"
      :target="moveTarget"
      :facts="facts"
      :needs-approval="needsApproval"
      @done="onDone"
      @refused="onRefused"
    />
  </div>
</template>

<style scoped>
.scheme-view__add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.scheme-view__notice {
  margin-bottom: 16px;
}
.scheme-view__notice a {
  margin-left: 6px;
}
.scheme-view__heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.scheme-view__count {
  font-size: 13px;
  font-weight: 400;
}
.scheme-view__tree-tools {
  display: inline-flex;
  gap: 0;
  flex-shrink: 0;
}
.scheme-view__tree-tools .el-button + .el-button {
  margin-left: 4px;
}
.app-card__title {
  flex-wrap: wrap;
}
.scheme-view__notes:empty {
  display: none;
}
.scheme-view__notes {
  margin: -4px 0 8px;
}
.scheme-view__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary);
}
.scheme-view__note > .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.scheme-view__retry {
  font-size: 12px;
  vertical-align: baseline;
}
.scheme-view__glance-empty {
  margin: 0;
  font-size: 13px;
}
.glance-bar {
  display: flex;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  gap: 2px;
  background: var(--el-fill-color);
}
.glance-bar__seg {
  display: block;
  flex-basis: 0;
  min-width: 3px;
}
.glance-legend {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.glance-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  min-width: 0;
}
.glance-legend__dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.glance-legend__name {
  overflow-wrap: anywhere;
}
.glance-legend__pct {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.scheme-view__uncounted-help {
  margin: -4px 0 12px;
  font-size: 13px;
}
.uncounted {
  list-style: none;
  margin: 0;
  padding: 0;
}
.uncounted li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 14px;
}
.uncounted li:last-child {
  border-bottom: none;
}
.uncounted__icon {
  color: var(--el-text-color-secondary);
}
.uncounted__title {
  text-decoration: none;
  overflow-wrap: anywhere;
}
.uncounted__title:hover {
  text-decoration: underline;
}
.uncounted__points {
  margin-left: auto;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
