<script setup lang="ts">
// One group of a set, for staff: its name, how many are in it and how many
// sign-up takes it to, its members (each to choose and move, where the
// reader forms groups), and the work it has for the set's assignments, with
// each work's state: a group with work is one a move touches, and the page
// says so before it is moved. Its ⋯ renames it, sets its capacity, archives
// it while nobody is in it and it has no work, or brings it back. Students
// dragged onto it are moved into it.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppTag from '@/components/AppTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import StudentItem from './StudentItem.vue'
import { byName, hasWork, type Group } from './groupModel'

const props = defineProps<{
  courseId: string
  group: Group
  groups: Group[]
  /** The reader forms groups here: members can be chosen and moved, and the group changed. */
  movable: boolean
  selected: Set<string>
  /** Members' links to their work: the reader reads submissions. */
  readsWork: boolean
  /** The reader may read the member list: a group's members are named to them, those their scope reaches. */
  readsMembers: boolean
  locale: string
}>()
const emit = defineEmits<{
  toggle: [memberId: string]
  toggleAll: [memberIds: string[], on: boolean]
  move: [memberIds: string[], groupId: string | null]
  drop: [groupId: string, event: DragEvent]
  dragstart: [memberId: string, event: DragEvent]
  edit: []
  archive: []
  restore: []
}>()
const { t } = useI18n()

const members = computed(() => byName(props.group.members ?? [], props.locale))
const ids = computed(() => members.value.map((m) => m.member_id))
const chosen = computed(() => ids.value.filter((id) => props.selected.has(id)).length)
const archived = computed(() => !!props.group.archived_at)
const over = computed(() => (props.group.capacity ? props.group.size - props.group.capacity : 0))
/** Members the reader's scope does not reach: counted in its size, not listed. Nobody is named to one who may not read the member list. */
const hidden = computed(() => (props.readsMembers ? Math.max(0, props.group.size - members.value.length) : 0))
const titleId = computed(() => `group-${props.group.id}`)

const archiveWhy = computed(() =>
  props.group.size > 0
    ? t('groups.card.archiveNotEmpty')
    : hasWork(props.group)
      ? t('groups.card.archiveHasWork')
      : null,
)

const dragOver = ref(false)
function onDragOver(e: DragEvent) {
  if (!props.movable || archived.value || !e.dataTransfer?.types.includes('application/x-aishie-student')) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOver.value = true
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  if (!props.movable || archived.value) return
  e.preventDefault()
  emit('drop', props.group.id, e)
}
function onCommand(c: string) {
  if (c === 'edit') emit('edit')
  else if (c === 'archive') emit('archive')
  else if (c === 'restore') emit('restore')
}
</script>

<template>
  <article
    class="group-card"
    :class="{ 'is-archived': archived, 'is-drop': dragOver }"
    :aria-labelledby="titleId"
    :data-group="group.id"
    @dragover="onDragOver"
    @dragleave="dragOver = false"
    @drop="onDrop"
  >
    <header class="group-card__head">
      <el-checkbox
        v-if="movable && !archived && ids.length"
        class="group-card__all"
        :model-value="chosen > 0 && chosen === ids.length"
        :indeterminate="chosen > 0 && chosen < ids.length"
        :aria-label="t('groups.card.chooseAll', { name: group.name })"
        @update:model-value="(on: unknown) => emit('toggleAll', ids, !!on)"
      />
      <!-- Where the focus goes once students are moved into it (GroupSetView). -->
      <h3 :id="titleId" class="group-card__name" tabindex="-1">{{ group.name }}</h3>
      <el-dropdown v-if="movable" trigger="click" placement="bottom-end" @command="onCommand">
        <el-button size="small" class="group-card__more" :aria-label="t('groups.card.more', { name: group.name })">
          <el-icon aria-hidden="true"><MoreFilled /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-if="!archived">
              <el-dropdown-item command="edit">
                <el-icon aria-hidden="true"><Edit /></el-icon>{{ t('groups.card.edit') }}
              </el-dropdown-item>
              <el-dropdown-item command="archive" :disabled="!!archiveWhy" divided class="group-card__archive">
                <el-icon aria-hidden="true"><Box /></el-icon>
                <span class="group-card__item-text">
                  <span>{{ t('groups.card.archive') }}</span>
                  <span v-if="archiveWhy" class="group-card__why">{{ archiveWhy }}</span>
                </span>
              </el-dropdown-item>
            </template>
            <el-dropdown-item v-else command="restore">
              <el-icon aria-hidden="true"><RefreshLeft /></el-icon>{{ t('groups.card.restore') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>
    <p class="group-card__facts">
      <span class="group-card__size" data-num>{{
        group.capacity
          ? t('groups.card.sizeOf', { n: group.size, of: group.capacity })
          : t('groups.card.size', { n: group.size }, group.size)
      }}</span>
      <AppTag v-if="archived">{{ t('groups.archived') }}</AppTag>
      <AppTag v-else-if="over > 0" tone="wait">{{ t('groups.card.over', { n: over }, over) }}</AppTag>
      <AppTag v-else-if="group.full">{{ t('groups.card.full') }}</AppTag>
    </p>

    <ul v-if="group.work?.length" class="group-card__work" :aria-label="t('groups.card.work')">
      <li v-for="w in group.work" :key="w.assignment_id" class="group-card__work-item">
        <router-link
          v-if="readsWork"
          :to="{ name: 'course-submission', params: { courseId, submissionId: w.submission_id } }"
          class="group-card__work-title"
          >{{ w.title }}</router-link
        >
        <span v-else class="group-card__work-title">{{ w.title }}</span>
        <StatusTag vocab="submissionState" :value="w.state" />
      </li>
    </ul>

    <ul v-if="members.length" class="group-card__members">
      <StudentItem
        v-for="m in members"
        :key="m.member_id"
        :member="m"
        :groups="groups"
        :group-id="group.id"
        :movable="movable && !archived"
        :selected="selected.has(m.member_id)"
        @toggle="emit('toggle', m.member_id)"
        @move="(to) => emit('move', [m.member_id], to)"
        @dragstart="(e) => emit('dragstart', m.member_id, e)"
      />
    </ul>
    <p v-else-if="!group.size" class="group-card__empty">{{ t('groups.card.empty') }}</p>
    <p v-if="hidden" class="group-card__hidden">{{ t('groups.card.hidden', { n: hidden }, hidden) }}</p>
  </article>
</template>

<style scoped>
.group-card {
  border: 1px solid var(--app-line);
  border-radius: var(--app-radius-card);
  padding: var(--app-space-md);
  min-width: 0;
  transition: border-color 0.15s;
}
.group-card.is-drop {
  border-color: var(--app-indigo);
  box-shadow: inset 0 0 0 1px var(--app-indigo);
}
.group-card.is-archived {
  border-style: dashed;
}
.group-card__head {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
}
.group-card__all {
  height: auto;
  margin-right: 0;
}
.group-card__name {
  flex: 1 1 auto;
  outline-offset: 2px;
  min-width: 0;
  margin: 0;
  font-size: var(--app-text-lg);
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.group-card__more {
  padding-left: 7px;
  padding-right: 7px;
}
.group-card__facts {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-xs) var(--app-space-sm);
  margin: var(--app-space-xs) 0 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
.group-card__work {
  list-style: none;
  margin: var(--app-space-sm) 0 0;
  padding: var(--app-space-sm) 0 0;
  border-top: 1px dashed var(--app-line);
  font-size: var(--app-text-sm);
}
.group-card__work-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-sm);
  padding: 2px 0;
}
.group-card__work-title {
  min-width: 0;
  overflow-wrap: anywhere;
}
.group-card__members {
  list-style: none;
  margin: var(--app-space-sm) 0 0;
  padding: 0;
}
.group-card__empty,
.group-card__hidden {
  margin: var(--app-space-sm) 0 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
}
</style>

<!-- The ⋯ menu is drawn in a popper outside the component. -->
<style>
.group-card__item-text {
  display: flex;
  flex-direction: column;
}
.group-card__why {
  max-width: 260px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  white-space: normal;
}
</style>
