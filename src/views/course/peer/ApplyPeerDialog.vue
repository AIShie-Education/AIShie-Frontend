<script setup lang="ts">
// Counting peer evaluation in an assignment's grades (grade.apply_peer),
// for whoever both enters and posts grades: each member's grade now and
// what it would be, group by group, as the results read say. A graded
// member's score is worked out again from the group's score and what they
// received, at the form's weight; a grade a grader adjusted themselves is
// left as it is (their adjustment wins); one not graded yet is counted when
// it is. Where the form no longer counts (switched off, or a weight of 0),
// it takes every peer adjustment counted before away. It is refused while
// the window is open and the form counts: it counts once it closes.
//
// Where the caller's seat proposes it, the factors as they are now are
// recorded with the proposal, and approving it is refused if any of these
// grades, or the form, has changed by then: the dialog says so.
//
// It lists the groups the results do: those whose members are all within
// the caller's reach. Core, though, writes again every grade of the
// assignment it would change, in every group, and refuses the whole of it
// (student_out_of_scope) if any of those is beyond the caller's reach. A
// seat that reaches only some students is told so before it counts, and
// the refusal is said in those words.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { formCounts, type PeerResults } from './peer'
import { applyPreview } from './peerResults'

const props = defineProps<{ courseId: string; assignmentId: string; results: PeerResults }>()
const visible = defineModel<boolean>('visible', { required: true })
const emit = defineEmits<{ done: [outcome: { status: 'executed' | 'proposed'; written: number }] }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

const form = computed(() => props.results.form)
const counts = computed(() => formCounts(form.value))
/** It counts, and has not closed: Core refuses it (window_open). */
const stillOpen = computed(() => counts.value && new Date(form.value.closes_at).getTime() > Date.now())
const rows = computed(() => applyPreview(props.results))
const changing = computed(() => rows.value.filter((r) => r.outcome === 'changes').length)
const weight = computed(() => (ui.locale, formatPct(form.value.weight / 100, 0)))
const needsApproval = computed(() => course.needsApprovalAll(['grade_submit', 'grade_post']))
/** The seat reaches only some students: the list may leave out grades counting it would write. */
const someStudents = computed(() => {
  const scope = (course.seat ?? course.membership)?.student_scope
  return !!scope && scope !== 'all'
})

function delta(before: number | string | null, after: number | string | null): string {
  const d = Math.round((Number(after) - Number(before)) * 100) / 100
  if (!Number.isFinite(d) || d === 0) return ''
  return d > 0 ? t('peer.results.up', { n: formatDecimal(d) }) : t('peer.results.down', { n: formatDecimal(-d) })
}

const applyW = useWrite('grade.apply_peer')
async function apply() {
  const out = await applyW.run(
    { course_id: props.courseId, assignment_id: props.assignmentId },
    { success: false, reasons: ['peer.apply.refusal', 'peer.refusal'] },
  )
  if (!out) return
  const written = out.status === 'executed' ? (out.result.written ?? []).length : 0
  visible.value = false
  emit('done', { status: out.status, written })
}
</script>

<template>
  <el-dialog v-model="visible" :title="t('peer.apply.title')" width="560px" top="6vh" destroy-on-close>
    <AppNote class="peer-apply__note">
      <p class="peer-apply__para">
        {{ counts ? t('peer.apply.intro', { weight }) : t('peer.apply.takeAway') }}
      </p>
      <p class="peer-apply__para">{{ t('peer.apply.own') }}</p>
    </AppNote>
    <el-alert v-if="stillOpen" type="warning" :closable="false" show-icon class="peer-apply__note">
      <i18n-t keypath="peer.apply.open" tag="span" scope="global">
        <template #at><TimeText :value="form.closes_at" cutoff /></template>
      </i18n-t>
    </el-alert>

    <div class="peer-apply__table-wrap">
      <table class="peer-apply__table">
        <thead>
          <tr>
            <th scope="col">{{ t('peer.apply.member') }}</th>
            <th scope="col" class="peer-apply__num">{{ t('peer.apply.now') }}</th>
            <th scope="col" class="peer-apply__num">{{ t('peer.apply.after') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.groupId + r.memberId" :data-test="`peer-apply-${r.memberId}`">
            <th scope="row" class="peer-apply__who">
              <span class="peer-apply__name">{{ r.name }}</span>
              <span class="app-muted peer-apply__group">{{ r.groupName }}</span>
            </th>
            <td class="peer-apply__num">
              <template v-if="r.before !== null">
                {{ formatDecimal(r.before) }}
                <AppTag v-if="!r.posted" tone="wait">{{ t('peer.results.gradeState.draft') }}</AppTag>
              </template>
              <span v-else class="app-muted">—</span>
            </td>
            <td class="peer-apply__num">
              <template v-if="r.outcome === 'changes'">
                <strong>{{ formatDecimal(r.after) }}</strong>
                <div class="app-form-hint">{{ delta(r.before, r.after) }}</div>
              </template>
              <span v-else class="app-muted">{{ t(`peer.apply.outcome.${r.outcome}`) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="peer-apply__count">
      {{ changing ? t('peer.apply.changing', { n: changing }, changing) : t('peer.apply.nothing') }}
    </p>
    <AppNote v-if="someStudents" class="peer-apply__note" data-test="peer-apply-scoped">{{
      t('peer.apply.someStudents')
    }}</AppNote>
    <AppNote v-if="needsApproval" plain class="peer-apply__note">{{ t('peer.apply.approval') }}</AppNote>

    <template #footer>
      <div class="peer-apply__footer">
        <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
        <span class="app-toolbar__spacer" />
        <el-button @click="visible = false">{{ t('common.actions.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="applyW.pending.value"
          :disabled="!course.writable || stillOpen"
          data-test="peer-apply-confirm"
          @click="apply"
        >
          {{ t('peer.apply.confirm') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.peer-apply__note {
  margin-bottom: 12px;
}
.peer-apply__para {
  margin: 0;
}
.peer-apply__para + .peer-apply__para {
  margin-top: 6px;
}
.peer-apply__table-wrap {
  max-height: 50vh;
  overflow: auto;
}
.peer-apply__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--app-text-sm);
}
.peer-apply__table th,
.peer-apply__table td {
  padding: 8px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
  vertical-align: top;
}
.peer-apply__table thead th {
  color: var(--app-ink-3);
  font-weight: var(--app-weight-strong);
}
.peer-apply__table .peer-apply__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.peer-apply__who {
  font-weight: 400;
}
.peer-apply__name {
  display: block;
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.peer-apply__group {
  font-size: var(--app-text-xs);
}
.peer-apply__count {
  margin: 12px 0;
  font-size: var(--app-text-sm);
}
.peer-apply__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
