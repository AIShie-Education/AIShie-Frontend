<script setup lang="ts">
// What moving students does to work a group has (group.set_members refused
// group_has_work): each work it touches, its group, its assignment and its
// state, and what becomes of it. A draft follows the group: whoever is in it
// now reads and writes it, so one who leaves stops and one who joins
// starts. Work handed in, or recorded missing, keeps who it was handed in
// for: a student who leaves keeps their part in it and their grade from it,
// and one who joins has none. Moving them anyway places them again, saying
// so (affects_work).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StatusTag from '@/components/StatusTag.vue'
import { useCourseStore } from '@/stores/course'
import type { GroupSet } from './groupModel'
import type { PendingPlacement } from './usePlacements'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ pending: PendingPlacement | null; set: GroupSet | undefined; busy: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
const course = useCourseStore()

/** Each work, by its group's name and its assignment's title, as the set shows them. */
const rows = computed(() =>
  (props.pending?.work ?? []).map((w) => {
    const g = props.set?.groups?.find((x) => x.id === w.group_id)
    const title =
      g?.work?.find((x) => x.assignment_id === w.assignment_id)?.title ??
      props.set?.assignments?.find((a) => a.assignment_id === w.assignment_id)?.title ??
      course.assignmentTitle(w.assignment_id) ??
      t('groups.affects.anAssignment')
    return { key: `${w.group_id}:${w.assignment_id}`, group: g?.name ?? '', title, state: w.state }
  }),
)
const hasDraft = computed(() => rows.value.some((r) => r.state === 'draft'))
const hasHandedIn = computed(() => rows.value.some((r) => r.state !== 'draft'))
</script>

<template>
  <el-dialog v-model="open" :title="t('groups.affects.title')" width="560px" destroy-on-close class="affects-work">
    <p class="affects-work__lead">{{ t('groups.affects.lead') }}</p>
    <ul v-if="rows.length" class="affects-work__list">
      <li v-for="r in rows" :key="r.key" class="affects-work__row">
        <span class="affects-work__what">
          <span class="affects-work__group">{{ r.group }}</span>
          <span class="affects-work__title">{{ r.title }}</span>
        </span>
        <StatusTag vocab="submissionState" :value="r.state" />
      </li>
    </ul>
    <p v-else class="affects-work__lead">{{ t('groups.affects.unnamed') }}</p>
    <ul class="affects-work__rules">
      <li v-if="hasDraft || !rows.length">{{ t('groups.affects.draft') }}</li>
      <li v-if="hasHandedIn || !rows.length">{{ t('groups.affects.handedIn') }}</li>
    </ul>
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="busy" :disabled="!course.writable" @click="emit('confirm')">
        {{ t('groups.affects.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.affects-work__lead {
  margin: 0 0 var(--app-space-md);
  line-height: var(--app-lh-text);
}
.affects-work__list {
  list-style: none;
  margin: 0 0 var(--app-space-md);
  padding: 0;
  border-top: 1px solid var(--app-line);
}
.affects-work__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-md);
  padding: var(--app-space-sm) 0;
  border-bottom: 1px solid var(--app-line);
}
.affects-work__what {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.affects-work__group {
  font-weight: var(--app-weight-strong);
}
.affects-work__title {
  color: var(--app-ink-2);
  font-size: var(--app-text-sm);
  overflow-wrap: anywhere;
}
.affects-work__rules {
  margin: 0;
  padding-inline-start: 1.25em;
  color: var(--app-ink-2);
  line-height: var(--app-lh-text);
}
.affects-work__rules li + li {
  margin-top: var(--app-space-xs);
}
</style>
