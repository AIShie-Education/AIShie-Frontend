<script setup lang="ts">
// The working behind a rolled-up total, as Core wrote it down: each
// assignment in a bucket (weighted by its points) or each child component
// (weighted by its weight), its fraction, and whether it was dropped. The
// share beside a weight is its part in the result: what was dropped or had
// no result was left out, and the rest re-normalised. The line of an
// assignment deleted for good since says so, and nothing of its grade.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Document, Folder } from '@element-plus/icons-vue'
import AppTag from '@/components/AppTag.vue'
import IdText from '@/components/IdText.vue'
import { formatScore, fractionPercent, shares, type WorkingItem } from './grading'

const props = defineProps<{ items: WorkingItem[]; name: (item: WorkingItem) => string | null }>()
const { t } = useI18n()

const shareOf = computed(() => shares(props.items))
function share(i: WorkingItem): string {
  const s = shareOf.value.get(i.id)
  return s === null || s === undefined ? '—' : fractionPercent(s)
}
</script>

<template>
  <el-table :data="items" row-key="id" size="small">
    <el-table-column :label="t('grades.working.item')" min-width="180">
      <template #default="{ row }">
        <span v-if="row.deleted" class="working__name is-deleted">{{ t('grades.working.deleted') }}</span>
        <span v-else class="working__name" :class="{ 'is-dropped': row.dropped }">
          <span v-if="name(row)">{{ name(row) }}</span>
          <IdText v-else :id="row.id" />
        </span>
        <AppTag variant="outline" :icon="row.kind === 'assignment' ? Document : Folder" class="working__kind">
          {{ row.kind === 'assignment' ? t('grades.working.kindAssignment') : t('grades.working.kindComponent') }}
        </AppTag>
      </template>
    </el-table-column>
    <el-table-column :label="t('grades.working.fraction')" min-width="110" align="right">
      <template #default="{ row }">
        <span v-if="row.deleted" class="app-muted">—</span>
        <span v-else-if="row.fraction !== null && row.fraction !== undefined" class="working__num">{{
          fractionPercent(row.fraction)
        }}</span>
        <span v-else class="app-muted">{{ t('grades.working.notGraded') }}</span>
      </template>
    </el-table-column>
    <el-table-column :label="t('grades.working.weight')" min-width="130" align="right">
      <template #default="{ row }">
        <span v-if="row.deleted" class="app-muted">—</span>
        <span v-else class="working__num">
          {{
            row.kind === 'assignment'
              ? t('grades.working.points', { n: formatScore(row.weight) })
              : formatScore(row.weight)
          }}
        </span>
        <span v-if="!row.deleted" class="app-muted working__share" :title="t('grades.working.shareHint')">{{
          share(row)
        }}</span>
      </template>
    </el-table-column>
    <el-table-column min-width="100">
      <template #default="{ row }">
        <AppTag v-if="row.dropped">{{ t('grades.working.dropped') }}</AppTag>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.working__name {
  word-break: break-word;
}
.working__name.is-dropped {
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}
.working__name.is-deleted {
  color: var(--el-text-color-secondary);
}
.working__kind {
  margin-left: 6px;
}
.working__num {
  font-variant-numeric: tabular-nums;
}
.working__share {
  margin-left: 6px;
  font-size: var(--app-text-xs);
}
</style>
