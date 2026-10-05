<script setup lang="ts">
// One group set (group_set.get), under the course's Groups tab.
//
// Staff see its groups as cards, each with its members, how many sign-up
// takes it to and the work it has for the set's assignments; the students
// in no group; and whether students may sign themselves up, until when.
// Those who write assignments form the groups: they add groups, rename them
// and set their capacity, archive an empty one; place students by hand,
// choosing them and "Move to…" (a menu, from the keyboard as well), a row's
// own menu, or dragging a student onto a group, with what a move does to a
// group's work said first (AffectsWorkDialog); split the class at random
// (SplitDialog), the deal shown before it is made and the groups it left
// alone said after; open and close sign-up and set its deadline; read who
// was in which group when (HistoryDrawer); and download the groups as CSV.
//
// A student sees their own group and its members, and sign-up while it is
// open (StudentSet): never another group's members, nor any group's work.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { read, type ToolOut, type WriteOutcome } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { intlLocale } from '@/i18n'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList } from '@/utils/format'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import StatusTag from '@/components/StatusTag.vue'
import AddGroupsDialog from './components/AddGroupsDialog.vue'
import AffectsWorkDialog from './components/AffectsWorkDialog.vue'
import GroupCard from './components/GroupCard.vue'
import GroupDialog from './components/GroupDialog.vue'
import HistoryDrawer from './components/HistoryDrawer.vue'
import MoveMenu from './components/MoveMenu.vue'
import SetFormDialog from './components/SetFormDialog.vue'
import SignupLine from './components/SignupLine.vue'
import SplitDialog from './components/SplitDialog.vue'
import StudentItem from './components/StudentItem.vue'
import StudentSet from './components/StudentSet.vue'
import { usePlacements } from './components/usePlacements'
import {
  archivedGroups,
  byName,
  csvFileName,
  GROUP_REFUSALS,
  groupOf,
  groupsCsv,
  listParts,
  liveGroups,
  nameOf,
  saveText,
  studentsOf,
  type Group,
} from './components/groupModel'

const props = defineProps<{ courseId: string; setId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

const state = useAsync(() => read('group_set.get', { course_id: props.courseId, set_id: props.setId }), {
  watch: [() => props.setId],
  keepData: true,
})
const set = computed(() => (state.data.value?.id === props.setId ? state.data.value : undefined))
const reload = () => state.reload()

/** Forming groups is part of setting group work: those who write assignments do it. */
const canForm = computed(() => course.can('assignment_write'))
const readsMembers = computed(() => course.can('member_read'))
const studentView = computed(() => course.role === 'student' || !(canForm.value || readsMembers.value))
const archived = computed(() => !!set.value?.archived_at)
/** Students can be placed, and groups changed, here and now. */
const movable = computed(() => canForm.value && course.writable && !archived.value && !studentView.value)

onMounted(() => {
  if (readsMembers.value) void course.ensureMembers()
})

const groups = computed(() => (set.value ? liveGroups(set.value) : []))
const archivedList = computed(() => (set.value ? archivedGroups(set.value) : []))
const showArchivedGroups = ref(false)
const shownGroups = computed(() => (showArchivedGroups.value ? [...groups.value, ...archivedList.value] : groups.value))
const unassigned = computed(() => byName(set.value?.unassigned ?? [], ui.locale))
const students = computed(() => (set.value ? studentsOf(set.value) : new Map()))
const unnamed = computed(() => t('common.labels.someMember'))
const nameFor = (id: string) => {
  const m = students.value.get(id)
  return m ? nameOf(m, unnamed.value) : unnamed.value
}

// --- Choosing students, and moving them -------------------------------------
const selected = ref(new Set<string>())
watch(set, (s) => {
  // Those no longer shown (removed from the course, say) are no longer chosen.
  if (!s) return
  const shown = studentsOf(s)
  const kept = [...selected.value].filter((id) => shown.has(id))
  if (kept.length !== selected.value.size) selected.value = new Set(kept)
})
function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll(ids: string[], on: boolean) {
  const next = new Set(selected.value)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  selected.value = next
}
const unassignedIds = computed(() => unassigned.value.map((m) => m.member_id))
const unassignedChosen = computed(() => unassignedIds.value.filter((id) => selected.value.has(id)).length)

/** The chosen students' group, where they share one. */
const chosenGroup = computed(() => {
  const s = set.value
  if (!s || !selected.value.size) return undefined
  const ids = [...selected.value].map((id) => groupOf(s, id)?.id ?? null)
  return ids.every((g) => g === ids[0]) ? ids[0] : undefined
})
const chosenPlaced = computed(() => {
  const s = set.value
  return !!s && [...selected.value].some((id) => !!groupOf(s, id))
})

const proposed = ref<string | null>(null)
function onWritten(out: WriteOutcome<unknown>) {
  if (out.status === 'proposed') proposed.value = out.actionId
  void reload()
}

const placements = usePlacements({
  courseId: () => props.courseId,
  set: () => set.value,
  nameOf: nameFor,
  done: (out) => {
    selected.value = new Set()
    onWritten(out)
  },
})
const affectsOpen = computed({
  get: () => !!placements.pending.value,
  set: (on: boolean) => {
    if (!on) placements.pending.value = null
  },
})

function move(ids: string[], groupId: string | null) {
  void placements.place(
    ids.map((id) => (groupId ? { student_member_id: id, group_id: groupId } : { student_member_id: id })),
  )
}
function moveChosen(groupId: string | null) {
  move([...selected.value], groupId)
}

// Dragging a student (or, from among those chosen, all of them) onto a group, or onto those in none.
const DRAG_TYPE = 'application/x-aishie-student'
function onDragStart(memberId: string, e: DragEvent) {
  if (!movable.value || !e.dataTransfer) return
  e.dataTransfer.setData(DRAG_TYPE, memberId)
  e.dataTransfer.effectAllowed = 'move'
}
function dropped(e: DragEvent): string[] {
  const id = e.dataTransfer?.getData(DRAG_TYPE)
  if (!id) return []
  return selected.value.has(id) ? [...selected.value] : [id]
}
function onDropOnGroup(groupId: string, e: DragEvent) {
  const ids = dropped(e).filter((id) => groupOf(set.value!, id)?.id !== groupId)
  if (ids.length) move(ids, groupId)
}
const dropOnNone = ref(false)
function onDragOverNone(e: DragEvent) {
  if (!movable.value || !e.dataTransfer?.types.includes(DRAG_TYPE)) return
  e.preventDefault()
  dropOnNone.value = true
}
function onDropOnNone(e: DragEvent) {
  dropOnNone.value = false
  if (!movable.value) return
  e.preventDefault()
  const ids = dropped(e).filter((id) => !!groupOf(set.value!, id))
  if (ids.length) move(ids, null)
}

// --- The set itself ---------------------------------------------------------
const editOpen = ref(false)
const addOpen = ref(false)
const splitOpen = ref(false)
const historyOpen = ref(false)
const editing = ref<Group | null>(null)
const groupOpen = computed({
  get: () => !!editing.value,
  set: (on: boolean) => {
    if (!on) editing.value = null
  },
})

const setUpdate = useWrite('group_set.update')
async function archiveSet(on: boolean) {
  const s = set.value
  if (!s) return
  if (on) {
    try {
      await ElMessageBox.confirm(t('groups.set.archiveConfirm', { name: s.name }), t('groups.set.archiveTitle'), {
        type: 'warning',
        confirmButtonText: t('groups.set.archive'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      })
    } catch {
      return
    }
  }
  const out = await setUpdate.run(
    { course_id: props.courseId, set_id: s.id, archived: on },
    {
      success: on ? t('groups.set.archived', { name: s.name }) : t('groups.set.restored', { name: s.name }),
      reasons: GROUP_REFUSALS,
    },
  )
  if (out) onWritten(out)
}

const groupUpdate = useWrite('group.update')
async function archiveGroup(g: Group, on: boolean) {
  if (on) {
    try {
      await ElMessageBox.confirm(t('groups.card.archiveConfirm', { name: g.name }), t('groups.card.archiveTitle'), {
        type: 'warning',
        confirmButtonText: t('groups.card.archive'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      })
    } catch {
      return
    }
  }
  const out = await groupUpdate.run(
    { course_id: props.courseId, group_id: g.id, archived: on },
    {
      success: on ? t('groups.card.archived', { name: g.name }) : t('groups.card.restored', { name: g.name }),
      reasons: GROUP_REFUSALS,
    },
  )
  if (out) onWritten(out)
}

// --- What the last split did ------------------------------------------------
const splitResult = ref<ToolOut<'group.split'> | null>(null)
function onSplit(out: WriteOutcome<ToolOut<'group.split'>>) {
  if (out.status === 'executed') splitResult.value = out.result
  onWritten(out)
}
const splitWords = computed(() => {
  void ui.locale
  const r = splitResult.value
  if (!r) return null
  const name = (id: string) =>
    set.value?.groups?.find((g) => g.id === id)?.name ?? r.created?.find((c) => c.group_id === id)?.name ?? ''
  const created = (r.created ?? []).map((c) => c.name)
  const kept = (r.kept ?? []).map((k) => name(k.group_id)).filter(Boolean)
  return {
    seed: r.seed,
    placed: (r.placed ?? []).length,
    created: formatList(created),
    createdN: created.length,
    kept: formatList(kept),
    keptN: kept.length,
    emptied: r.emptied,
  }
})

// --- The assignments using it ------------------------------------------------
const usedBy = computed(() => listParts(set.value?.assignments ?? [], (a) => a.title, intlLocale(ui.locale)))

// --- CSV ----------------------------------------------------------------------
function exportCsv() {
  const s = set.value
  if (!s) return
  const csv = groupsCsv(
    s,
    {
      set: t('groups.csv.set'),
      group: t('groups.csv.group'),
      member: t('groups.csv.member'),
      loginId: t('groups.csv.loginId'),
      joinedAt: t('groups.csv.joinedAt'),
      noGroup: t('groups.csv.noGroup'),
      unnamed: unnamed.value,
    },
    (id) => course.members.get(id)?.login_id,
    intlLocale(ui.locale),
  )
  const day = new Date().toLocaleDateString('sv-SE')
  saveText(csv, csvFileName([course.course?.code, course.course?.section, s.name, day]))
}

const lastLoad = computed(() => state.loading.value && !!set.value)
</script>

<template>
  <div class="set-view">
    <PageHeader :title="set?.name ?? t('groups.set.title')" :back="{ name: 'course-groups', params: { courseId } }">
      <template v-if="set?.archived_at" #tags>
        <AppTag size="default">{{ t('groups.archived') }}</AppTag>
      </template>
      <template v-if="set && canForm && !studentView">
        <template v-if="!archived">
          <el-button :disabled="!course.writable" @click="editOpen = true">
            <el-icon><Edit /></el-icon>
            <span>{{ t('common.actions.edit') }}</span>
          </el-button>
          <el-button :disabled="!course.writable" @click="addOpen = true">
            <el-icon><Plus /></el-icon>
            <span>{{ t('groups.set.addGroups') }}</span>
          </el-button>
          <el-button type="primary" :disabled="!course.writable" @click="splitOpen = true">
            <el-icon><Operation /></el-icon>
            <span>{{ t('groups.set.split') }}</span>
          </el-button>
        </template>
        <el-button v-else :disabled="!course.writable" :loading="setUpdate.pending.value" @click="archiveSet(false)">
          <el-icon><RefreshLeft /></el-icon>
          <span>{{ t('groups.set.restore') }}</span>
        </el-button>
        <StatusTag
          v-if="course.needsApproval('assignment_write')"
          vocab="level"
          value="confirm_required"
          size="small"
        />
        <el-dropdown v-if="!archived" trigger="click" placement="bottom-end" @command="archiveSet(true)">
          <el-button class="set-view__more" :aria-label="t('groups.set.more', { name: set.name })">
            <el-icon aria-hidden="true"><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="archive" :disabled="!course.writable">
                <el-icon aria-hidden="true"><Box /></el-icon>{{ t('groups.set.archiveMenu') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </PageHeader>

    <AppNote
      v-if="proposed"
      :title="t('groups.proposed.title')"
      class="set-view__note"
      closable
      @close="proposed = null"
    >
      <router-link :to="{ name: 'course-action', params: { courseId, actionId: proposed } }">
        {{ t('groups.proposed.view') }}
      </router-link>
    </AppNote>

    <AppNote
      v-if="splitWords"
      :title="t('groups.split.doneTitle', { seed: splitWords.seed })"
      class="set-view__note set-view__split-result"
      closable
      @close="splitResult = null"
    >
      <ul class="set-view__split-lines">
        <li>{{ t('groups.split.donePlaced', { n: splitWords.placed }, splitWords.placed) }}</li>
        <li v-if="splitWords.createdN">
          {{ t('groups.split.doneCreated', { names: splitWords.created }, splitWords.createdN) }}
        </li>
        <li v-if="splitWords.emptied">
          {{ t('groups.split.emptied', { n: splitWords.emptied }, splitWords.emptied) }}
        </li>
        <li>
          {{
            splitWords.keptN
              ? t('groups.split.doneKept', { names: splitWords.kept }, splitWords.keptN)
              : t('groups.split.doneNoneKept')
          }}
        </li>
      </ul>
    </AppNote>

    <AsyncState :loading="state.loading.value && !set" :error="state.error.value" @retry="reload">
      <template v-if="set">
        <StudentSet
          v-if="studentView"
          :course-id="courseId"
          :set="set"
          @changed="(id) => ((proposed = id), reload())"
        />
        <template v-else>
          <section class="app-card set-view__signup" aria-labelledby="set-view-signup">
            <!-- What the set is for opens its first card, not its header: a header of a back link, a title and a
                 line under it starts the page's content past the 200 px a course's page keeps to. -->
            <p v-if="set.description" class="set-view__description">{{ set.description }}</p>
            <div class="set-view__signup-head">
              <h2 id="set-view-signup" class="set-view__signup-title">{{ t('groups.signup.title') }}</h2>
              <SignupLine :signup="set.signup" staff countdown @ended="reload" />
              <el-button
                v-if="canForm && !archived"
                size="small"
                class="set-view__signup-edit"
                :disabled="!course.writable"
                @click="editOpen = true"
              >
                {{ t('groups.set.signupSettings') }}
              </el-button>
            </div>
            <p class="set-view__hint">
              {{ set.signup.open ? t('groups.set.signupOnHint') : t('groups.set.signupOffHint') }}
            </p>
            <i18n-t v-if="set.assignments?.length" keypath="common.pair" tag="p" scope="global" class="set-view__used">
              <template #label>{{ t('groups.list.usedBy') }}</template>
              <template #value>
                <template v-for="part in usedBy" :key="part.key">
                  <template v-if="'item' in part"
                    ><router-link
                      :to="{ name: 'course-assignment', params: { courseId, assignmentId: part.item.assignment_id } }"
                      >{{ part.item.title }}</router-link
                    ><span v-if="!part.item.published" class="set-view__unpublished">{{
                      t('common.bracketed', { text: t('groups.list.unpublished') })
                    }}</span></template
                  ><template v-else>{{ part.text }}</template>
                </template>
              </template>
            </i18n-t>
            <p v-else class="set-view__used app-muted">{{ t('groups.list.notUsed') }}</p>
          </section>

          <section class="app-card set-view__groups" aria-labelledby="set-view-groups">
            <div class="app-toolbar set-view__toolbar">
              <h2 id="set-view-groups" class="set-view__groups-title">{{ t('groups.set.groupsTitle') }}</h2>
              <template v-if="movable">
                <span class="set-view__chosen" aria-live="polite">{{
                  selected.size
                    ? t('groups.set.chosen', { n: selected.size }, selected.size)
                    : t('groups.set.chooseHint')
                }}</span>
                <MoveMenu
                  :groups="groups"
                  :current="chosenGroup"
                  :any-placed="chosenPlaced"
                  :label="t('groups.move.label')"
                  :disabled="!selected.size || placements.busy.value"
                  @move="moveChosen"
                />
                <el-button v-if="selected.size" link type="primary" @click="selected = new Set()">
                  {{ t('groups.set.clearChosen') }}
                </el-button>
              </template>
              <span class="app-toolbar__spacer" />
              <el-checkbox
                v-if="archivedList.length"
                v-model="showArchivedGroups"
                :label="t('groups.set.showArchived', { n: archivedList.length }, archivedList.length)"
                border
              />
              <el-button v-if="readsMembers" @click="historyOpen = true">
                <el-icon aria-hidden="true"><Clock /></el-icon>
                <span>{{ t('groups.history.button') }}</span>
              </el-button>
              <el-button v-if="readsMembers" :disabled="!groups.length && !unassigned.length" @click="exportCsv">
                <el-icon aria-hidden="true"><Download /></el-icon>
                <span>{{ t('groups.csv.button') }}</span>
              </el-button>
              <RefreshButton :loading="lastLoad" @click="reload" />
            </div>

            <section
              v-if="set.unassigned_count !== undefined && set.unassigned_count !== null"
              class="set-view__none"
              :class="{ 'is-drop': dropOnNone }"
              aria-labelledby="set-view-none"
              @dragover="onDragOverNone"
              @dragleave="dropOnNone = false"
              @drop="onDropOnNone"
            >
              <header class="set-view__none-head">
                <el-checkbox
                  v-if="movable && unassignedIds.length"
                  class="set-view__all"
                  :model-value="unassignedChosen > 0 && unassignedChosen === unassignedIds.length"
                  :indeterminate="unassignedChosen > 0 && unassignedChosen < unassignedIds.length"
                  :aria-label="t('groups.set.chooseNone')"
                  @update:model-value="(on: unknown) => toggleAll(unassignedIds, !!on)"
                />
                <h3 id="set-view-none" class="set-view__none-title">
                  {{
                    set.unassigned_count
                      ? t('groups.set.none', { n: set.unassigned_count }, set.unassigned_count)
                      : t('groups.set.allPlaced')
                  }}
                </h3>
              </header>
              <ul v-if="unassigned.length" class="set-view__none-list">
                <StudentItem
                  v-for="m in unassigned"
                  :key="m.member_id"
                  :member="m"
                  :groups="groups"
                  :group-id="null"
                  :movable="movable"
                  :selected="selected.has(m.member_id)"
                  @toggle="toggle(m.member_id)"
                  @move="(to) => move([m.member_id], to)"
                  @dragstart="(e) => onDragStart(m.member_id, e)"
                />
              </ul>
            </section>

            <div v-if="shownGroups.length" class="set-view__grid">
              <GroupCard
                v-for="g in shownGroups"
                :key="g.id"
                :course-id="courseId"
                :group="g"
                :groups="groups"
                :movable="movable"
                :selected="selected"
                :reads-work="course.can('submission_read')"
                :locale="ui.locale"
                @toggle="toggle"
                @toggle-all="toggleAll"
                @move="move"
                @drop="onDropOnGroup"
                @dragstart="onDragStart"
                @edit="editing = g"
                @archive="archiveGroup(g, true)"
                @restore="archiveGroup(g, false)"
              />
            </div>
            <AppEmpty v-else :text="movable ? t('groups.set.noGroupsForm') : t('groups.set.noGroups')" />
            <p v-if="movable && shownGroups.length" class="app-form-hint set-view__drag-hint">
              {{ t('groups.set.dragHint') }}
            </p>
          </section>
        </template>
      </template>
    </AsyncState>

    <template v-if="set && canForm && !studentView">
      <SetFormDialog v-model="editOpen" :course-id="courseId" :set="set" @saved="onWritten" />
      <AddGroupsDialog v-model="addOpen" :course-id="courseId" :set="set" @saved="onWritten" />
      <GroupDialog v-model="groupOpen" :course-id="courseId" :group="editing" @saved="onWritten" />
      <SplitDialog v-model="splitOpen" :course-id="courseId" :set="set" @done="onSplit" />
      <AffectsWorkDialog
        v-model="affectsOpen"
        :pending="placements.pending.value"
        :set="set"
        :busy="placements.busy.value"
        @confirm="placements.confirm"
      />
    </template>
    <HistoryDrawer v-if="readsMembers && !studentView" v-model="historyOpen" :course-id="courseId" :set-id="setId" />
  </div>
</template>

<style scoped>
.set-view {
  container-type: inline-size;
}
.set-view__description {
  margin: 0 0 var(--app-space-md);
  color: var(--app-ink-2);
  line-height: var(--app-lh-text);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.set-view__more {
  padding-left: 9px;
  padding-right: 9px;
}
.set-view__note {
  margin-bottom: 16px;
}
.set-view__split-lines {
  margin: 0;
  padding-inline-start: 1.25em;
}
.set-view__signup-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-sm) var(--app-space-md);
}
.set-view__signup-title,
.set-view__groups-title {
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: var(--app-weight-strong);
}
.set-view__signup-edit {
  margin-inline-start: auto;
}
.set-view__hint,
.set-view__used {
  margin: var(--app-space-sm) 0 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
  line-height: var(--app-lh-text);
}
.set-view__unpublished {
  color: var(--app-ink-3);
}
.set-view__chosen {
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
}
.set-view__none {
  border: 1px dashed var(--app-line);
  border-radius: var(--app-radius-card);
  padding: var(--app-space-md);
  margin-bottom: var(--app-space-md);
}
.set-view__none.is-drop {
  border-color: var(--app-indigo);
  border-style: solid;
}
.set-view__none-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
}
.set-view__all {
  height: auto;
  margin-right: 0;
}
.set-view__none-title {
  margin: 0;
  font-size: var(--app-text-md);
  font-weight: var(--app-weight-strong);
}
.set-view__none-list {
  list-style: none;
  margin: var(--app-space-sm) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0 var(--app-space-md);
}
.set-view__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--app-space-md);
}
.set-view__drag-hint {
  margin-top: var(--app-space-md);
}
/* A finger does not drag a row: the box and "Move to…" are the way there. */
@media (pointer: coarse) {
  .set-view__drag-hint {
    display: none;
  }
}
</style>
