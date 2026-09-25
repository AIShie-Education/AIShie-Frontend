<script setup lang="ts">
// What the caller's seat may do, and how: at once, at once but reviewed
// after, or only once someone approves. Core does not tell a member its own
// permissions unless it may read the member list, so the course store's
// levels are exact, guessed from a built-in preset, or unknown; this card
// says which. Levels are the store's (course.level), so what Core has
// already refused counts as denied here too.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PERMS, type AutonomyLevel, type Perm } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import PermEditor from '@/components/PermEditor.vue'
import StatusTag from '@/components/StatusTag.vue'
import { presetLabel } from '@/views/course/members/components/seat'

const course = useCourseStore()
const { t } = useI18n()

const levels = computed(
  () => Object.fromEntries(PERMS.map((p) => [p, course.level(p) ?? 'denied'])) as Record<Perm, AutonomyLevel>,
)
const LEVELS: Exclude<AutonomyLevel, 'denied'>[] = ['autonomous', 'pending_review', 'confirm_required']
const groups = computed(() =>
  LEVELS.map((level) => ({ level, perms: PERMS.filter((p: Perm) => levels.value[p] === level) })).filter(
    (g) => g.perms.length,
  ),
)
const denied = computed(() => PERMS.filter((p) => levels.value[p] === 'denied'))
// Where Core's refusal overrules what the seat was taken to hold, say so on that row.
const refusedWarn = computed(
  () =>
    Object.fromEntries(
      [...course.refused]
        .filter((p) => (course.perms[p] ?? 'denied') !== 'denied')
        .map((p) => [p, t('overview.perms.refused')]),
    ) as Partial<Record<Perm, string>>,
)

/**
 * The built-in preset the store guessed from, by the same rule: the one named
 * after the roster role, or for an agent's assistant seat the grader (listed
 * to assignments) or the tutor (listed to students).
 */
const guessedPreset = computed(() => {
  const m = course.membership
  if (!m) return null
  if (m.role !== 'assistant') return m.role
  if (m.assignment_scope === 'listed' && m.student_scope === 'all') return 'grader'
  if (m.student_scope === 'listed' && m.assignment_scope === 'all') return 'tutor'
  return null
})
const presetText = computed(() =>
  t('overview.perms.preset', { preset: guessedPreset.value ? presetLabel({ name: guessedPreset.value }) : '' }),
)
const open = ref<string[]>([])
</script>

<template>
  <section class="app-card perms">
    <h2 class="app-card__title">{{ t('overview.perms.title') }}</h2>

    <p class="perms__source" :class="`is-${course.permsSource}`">
      <el-icon v-if="course.permsSource === 'exact'"><CircleCheck /></el-icon>
      <el-icon v-else-if="course.permsSource === 'preset'"><InfoFilled /></el-icon>
      <el-icon v-else><Warning /></el-icon>
      <span v-if="course.permsSource === 'exact'">{{ t('overview.perms.exact') }}</span>
      <span v-else-if="course.permsSource === 'preset'">{{ presetText }}</span>
      <span v-else>{{ t('overview.perms.unknown') }}</span>
    </p>

    <template v-if="course.permsSource !== 'unknown'">
      <p v-if="!groups.length" class="app-muted">{{ t('overview.perms.nothing') }}</p>
      <div v-for="g in groups" :key="g.level" class="perms__group">
        <div class="perms__group-head">
          <StatusTag vocab="level" :value="g.level" />
          <span class="perms__group-help">{{ t(`enums.levelHelp.${g.level}`) }}</span>
        </div>
        <ul class="perms__names">
          <li v-for="p in g.perms" :key="p">
            <el-tooltip :content="t(`enums.permHelp.${p}`)" placement="top">
              <span class="perms__name">{{ t(`enums.perm.${p}`) }}</span>
            </el-tooltip>
          </li>
        </ul>
      </div>
      <p v-if="denied.length && groups.length" class="perms__denied app-muted">
        {{ t('overview.perms.deniedCount', { n: denied.length }) }}
      </p>

      <el-collapse v-model="open" class="perms__all">
        <el-collapse-item name="all" :title="t('overview.perms.showAll')">
          <PermEditor :model-value="levels" :warn="refusedWarn" readonly size="small" />
        </el-collapse-item>
      </el-collapse>
    </template>
  </section>
</template>

<style scoped>
.perms__source {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}
.perms__source .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
}
.perms__source.is-exact .el-icon {
  color: var(--el-color-success);
}
.perms__source.is-preset .el-icon {
  color: var(--el-color-primary);
}
.perms__source.is-unknown .el-icon {
  color: var(--el-color-warning);
}
.perms__group {
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.perms__group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.perms__group-help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.perms__names {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.perms__name {
  display: inline-block;
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  cursor: default;
}
.perms__denied {
  margin: 8px 0 0;
  font-size: 12px;
}
.perms__all {
  margin-top: 12px;
  border-bottom: none;
}
.perms__all :deep(.el-collapse-item__header) {
  font-weight: 500;
}
.perms__all :deep(.perm-editor__row) {
  flex-wrap: wrap;
  gap: 6px 16px;
}
</style>
