<script setup lang="ts">
// What a deletion of an assignment for good (assignment.delete) was
// confirmed with: the counts its proposer was shown, which Core holds the
// deletion to. While it waits for approval, what would go now is read beside
// them (assignment.delete_preview, for whoever writes assignments), and where
// more would go now, approving it is said to fail: Core refuses a deletion
// that would take more than was confirmed (confirm_stale).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { AssignmentDeletePreview, DeletionCounts } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import { formatCount } from '@/utils/format'
import { COUNT_KEYS, confirmOf, countsGrown, isDeletedError } from '@/views/course/assignments/components/deletion'
import type { ActionRow } from './actionText'

const props = defineProps<{ action: ActionRow; courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()

const was = computed(() => confirmOf(props.action.payload))
const waiting = computed(() => props.action.status === 'proposed')
const assignmentId = computed(() => props.action.target_id ?? undefined)

const now = useAsync<AssignmentDeletePreview | null>(
  async () => {
    const id = assignmentId.value
    if (!waiting.value || !id || !course.can('assignment_write')) return null
    return read('assignment.delete_preview', { course_id: props.courseId, assignment_id: id })
  },
  { watch: [waiting, assignmentId] },
)
const gone = computed(() => !!now.error.value && isDeletedError(now.error.value))
const current = computed<DeletionCounts | null>(() => now.data.value?.counts ?? null)
const grown = computed(() => !!current.value && countsGrown(was.value, current.value))

interface Row {
  key: (typeof COUNT_KEYS)[number]
  was: number | null
  now: number | null
}
/** Each count either column has, not nought. */
const rows = computed<Row[]>(() =>
  COUNT_KEYS.map((key) => ({ key, was: was.value?.[key] ?? null, now: current.value?.[key] ?? null })).filter(
    (r) => !!r.was || !!r.now,
  ),
)
</script>

<template>
  <div class="deletion-proposal">
    <el-alert v-if="grown" type="warning" :closable="false" show-icon class="deletion-proposal__alert">
      <template #title>{{ t('actions.deletion.staleProposal') }}</template>
    </el-alert>
    <p v-if="gone" class="deletion-proposal__p">{{ t('actions.deletion.gone') }}</p>
    <p v-if="!rows.length && was" class="deletion-proposal__p">{{ t('actions.deletion.nothing') }}</p>
    <table v-if="rows.length" class="deletion-proposal__table">
      <thead>
        <tr>
          <th scope="col">{{ t('actions.deletion.what') }}</th>
          <th scope="col" class="deletion-proposal__num">
            {{ waiting ? t('actions.deletion.whenProposed') : t('actions.deletion.confirmed') }}
          </th>
          <th v-if="current" scope="col" class="deletion-proposal__num">{{ t('actions.deletion.now') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.key">
          <th scope="row">{{ t(`actions.deletion.count.${r.key}`) }}</th>
          <td class="deletion-proposal__num">{{ r.was === null ? '—' : formatCount(r.was) }}</td>
          <td
            v-if="current"
            class="deletion-proposal__num"
            :class="{ 'is-grown': r.now !== null && r.now > (r.was ?? 0) }"
          >
            {{ r.now === null ? '—' : formatCount(r.now) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p class="deletion-proposal__p app-form-hint">{{ t('actions.deletion.documentsStay') }}</p>
  </div>
</template>

<style scoped>
.deletion-proposal__alert {
  margin-bottom: 12px;
}
.deletion-proposal__p {
  margin: 0 0 10px;
  line-height: var(--app-lh-text);
}
.deletion-proposal__table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px;
  font-size: var(--app-text-sm);
}
.deletion-proposal__table th,
.deletion-proposal__table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.deletion-proposal__table thead th {
  color: var(--app-ink-3);
}
.deletion-proposal__table tbody th {
  font-weight: 400;
}
.deletion-proposal__table .deletion-proposal__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.deletion-proposal__table .is-grown {
  color: var(--el-color-danger);
  font-weight: var(--app-weight-strong);
}
</style>
