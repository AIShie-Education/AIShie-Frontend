<script setup lang="ts">
// Presets side by side: one column each, one row for the roster role, the two
// scopes and each of the permissions.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PERMS, SCOPED_PERMS, type Perm, type Preset } from '@/api/types'
import StatusTag from '@/components/StatusTag.vue'
import { fullPerms, hasOwnLabel, isBuiltin, presetLabel } from './presets'

const props = defineProps<{ presets: Preset[]; deptName: (id: string | null | undefined) => string | null }>()
const emit = defineEmits<{ open: [preset: Preset] }>()
const { t } = useI18n()

type Row = { key: 'role' | 'student_scope' | 'assignment_scope'; kind: 'meta' } | { key: Perm; kind: 'perm' }
const rows = computed<Row[]>(() => [
  { key: 'role', kind: 'meta' },
  { key: 'student_scope', kind: 'meta' },
  { key: 'assignment_scope', kind: 'meta' },
  ...PERMS.map((p): Row => ({ key: p, kind: 'perm' })),
])

const levels = computed(() => new Map(props.presets.map((p) => [p.id, fullPerms(p.perms)])))

function metaLabel(key: string): string {
  if (key === 'role') return t('adminSetup.presets.role')
  if (key === 'student_scope') return t('adminSetup.presets.studentScope')
  return t('adminSetup.presets.assignmentScope')
}

/** What a permission covers, and for a scoped one that a seat's scope bounds it (the marker's meaning). */
function permTip(p: Perm): string {
  const help = t(`enums.permHelp.${p}`)
  return SCOPED_PERMS.includes(p) ? `${help} — ${t('common.labels.scopedHelp')}` : help
}

function rowClass({ row }: { row: Row }): string {
  return row.key === 'assignment_scope' ? 'matrix-row--last-meta' : ''
}
</script>

<template>
  <el-table
    :data="rows"
    row-key="key"
    :row-class-name="rowClass"
    class="preset-matrix"
    size="small"
    scrollbar-always-on
  >
    <el-table-column fixed="left" min-width="160" class-name="matrix-label-col">
      <template #default="{ row }">
        <div v-if="row.kind === 'perm'" class="matrix-label">
          <el-tooltip :content="permTip(row.key)" placement="right">
            <span class="matrix-label__name">
              {{ t(`enums.perm.${row.key}`) }}
              <el-icon
                v-if="SCOPED_PERMS.includes(row.key)"
                class="matrix-label__scoped"
                role="img"
                :aria-label="t('common.labels.scoped')"
                ><Aim
              /></el-icon>
            </span>
          </el-tooltip>
          <code class="matrix-label__key">{{ row.key }}</code>
        </div>
        <div v-else class="matrix-label matrix-label--meta">{{ metaLabel(row.key) }}</div>
      </template>
    </el-table-column>
    <el-table-column v-for="p in presets" :key="p.id" min-width="152" align="center">
      <template #header>
        <button type="button" class="matrix-head" @click="emit('open', p)">
          <span class="matrix-head__name">{{ presetLabel(p) }}</span>
          <span class="matrix-head__where">
            {{ isBuiltin(p) ? t('adminSetup.presets.builtin') : (deptName(p.dept_id) ?? t('adminSetup.presets.own')) }}
            <template v-if="hasOwnLabel(p)">
              · <code class="matrix-head__key">{{ p.name }}</code></template
            >
          </span>
        </button>
      </template>
      <template #default="{ row }">
        <StatusTag v-if="row.key === 'role'" vocab="role" :value="p.role" />
        <StatusTag v-else-if="row.key === 'student_scope'" vocab="scope" :value="p.student_scope" />
        <StatusTag v-else-if="row.key === 'assignment_scope'" vocab="scope" :value="p.assignment_scope" />
        <StatusTag v-else vocab="level" :value="levels.get(p.id)?.[row.key] ?? 'denied'" />
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.matrix-label {
  display: flex;
  flex-direction: column;
  line-height: 1.35;
  text-align: left;
}
.matrix-label--meta {
  font-weight: var(--app-weight-strong);
  color: var(--el-text-color-primary);
}
.matrix-label__name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-primary);
  cursor: help;
}
.matrix-label__scoped {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
/* In the third ink, not the placeholder's, which does not read at AA on a hovered row. */
.matrix-label__key {
  font-family: var(--app-font-mono);
  font-size: var(--app-text-mark);
  color: var(--el-text-color-secondary);
}
.matrix-head {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  background: none;
  border: none;
  padding: 2px 4px;
  border-radius: var(--app-radius-control);
  cursor: pointer;
  font: inherit;
  color: var(--el-color-primary);
}
.matrix-head:hover,
.matrix-head:focus-visible {
  background: var(--el-color-primary-light-9);
}
.matrix-head__name {
  font-weight: var(--app-weight-strong);
  word-break: break-word;
  line-height: 1.3;
}
.matrix-head__where {
  font-size: var(--app-text-xs);
  font-weight: 400;
  color: var(--el-text-color-secondary);
  line-height: 1.3;
  word-break: break-word;
  white-space: normal;
}
.matrix-head__key {
  font-family: var(--app-font-mono);
}
.preset-matrix :deep(.matrix-row--last-meta td.el-table__cell) {
  border-bottom: 2px solid var(--el-border-color);
}
.preset-matrix :deep(.el-table__header .cell) {
  white-space: normal;
}
</style>
