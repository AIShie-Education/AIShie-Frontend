<script setup lang="ts">
// A student's own peer evaluation of their group, on the assignment's page
// (peer_form.get's task): whom they evaluate (every other member of their
// group's circle, and themselves where the form says so), the window, and
// their evaluation, filled in and sent (peer_review.submit) while it is
// open, as often as they like, the last one counting. A share form splits
// 100 points, which must add up; a rating form rates every member on every
// criterion. Once it closes, they read what they sent, and, where the form
// shares it, their own average from two peers or more. A student alone in
// their group, self-evaluation off, has nobody to evaluate (to_evaluate is
// empty, and Core takes no sheet of nobody): they are told so, and shown no
// form to fill in.
//
// Nothing of anyone else's evaluation, what was said of them, or who rated
// them is ever read here: Core gives a student none of it. A peer
// evaluation is a person's own judgment of their classmates: an agent, the
// student's own included, writes none, and is not offered to.
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { Assignment } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import { criteriaOf, formCounts, isRating, num, windowState } from './peer'
import {
  MAX_ENTRY_COMMENT,
  MAX_SHEET_COMMENT,
  SHARE_TOTAL,
  evenShares,
  sameAsSheet,
  shareTotal,
  sheetFrom,
  sheetProblems,
  submitArgs,
  type SheetDraft,
} from './peerSheet'

const props = defineProps<{ courseId: string; assignment: Assignment }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()

const state = useAsync(() => read('peer_form.get', { course_id: props.courseId, assignment_id: props.assignment.id }), {
  watch: [() => props.assignment.id],
  keepData: true,
})
const form = computed(() => state.data.value?.form ?? null)
const task = computed(() => state.data.value?.task ?? null)
const me = computed(() => course.myMemberId)
const shown = computed(() => !!form.value && !!task.value)

const win = computed(() => windowState(task.value?.window.state))
/** Nobody to evaluate: alone in the group's circle, with self-evaluation off. */
const nobody = computed(() => !!task.value && !(task.value.to_evaluate ?? []).length)
const rating = computed(() => !!form.value && isRating(form.value))
const criteria = computed(() => criteriaOf(form.value))
const names = computed(() => new Map((task.value?.circle ?? []).map((c) => [c.member_id, c.display_name])))
const nameOf = (id: string) => names.value.get(id) ?? t('common.labels.someMember')
const sheet = computed(() => task.value?.sheet ?? null)
const scale = computed(() => {
  const min = form.value?.scale_min ?? 0
  const max = form.value?.scale_max ?? 0
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i)
})

/** A person, seated as a student, whose seat may hand work in now: an agent writes no peer evaluation. */
const canWrite = computed(
  () =>
    course.writable &&
    !course.isDelegate &&
    course.membership?.status !== 'paused' &&
    course.can('submission_write') &&
    form.value?.enabled !== false &&
    win.value === 'open',
)
const needsApproval = computed(() => course.needsApproval('submission_write'))

// --- The sheet being filled in -------------------------------------------------------------
const draft = ref<SheetDraft>({ entries: [], comment: '' })
/** Which entries' comment fields are open. */
const commenting = ref(new Set<string>())
const tried = ref(false)
/**
 * The sheet as it was last filled in from what Core holds, and what it was
 * made from: reading the page again keeps what the student has typed since,
 * unless another sheet has been sent meanwhile (from another tab) or whom
 * they evaluate has changed.
 */
let synced = { json: '', sheet: '', whom: '' }
watch(
  () => [form.value, task.value] as const,
  ([f, tk]) => {
    if (!f || !tk) return
    const sheetId = tk.sheet?.review_id ?? ''
    const whom = [...(tk.to_evaluate ?? [])].sort().join(' ')
    const typed = JSON.stringify(draft.value) !== synced.json
    if (typed && synced.sheet === sheetId && synced.whom === whom) return
    draft.value = sheetFrom(f, tk, me.value)
    synced = { json: JSON.stringify(draft.value), sheet: sheetId, whom }
    commenting.value = new Set(draft.value.entries.filter((e) => e.comment).map((e) => e.memberId))
    tried.value = false
  },
  { immediate: true },
)

const total = computed(() => shareTotal(draft.value))
const problems = computed(() => (form.value ? sheetProblems(form.value, draft.value) : []))
const unchanged = computed(() => !!form.value && sameAsSheet(form.value, sheet.value, draft.value))
function problemText(p: (typeof problems.value)[number]): string {
  switch (p.kind) {
    case 'shareMissing':
      return t('peer.task.problem.shareMissing', { name: nameOf(p.memberId) })
    case 'shareInvalid':
      return t('peer.task.problem.shareInvalid', { name: nameOf(p.memberId) })
    case 'shareTotal':
      return t('peer.task.problem.shareTotal', { total: p.total })
    case 'ratingMissing':
      return t('peer.task.problem.ratingMissing', {
        name: nameOf(p.memberId),
        criterion: criteria.value.find((c) => c.key === p.criterion)?.label ?? p.criterion,
      })
    case 'commentTooLong':
      return t('peer.task.problem.commentTooLong')
  }
}
const problemLines = computed(() => [...new Set(problems.value.map(problemText))])

function splitEvenly() {
  const shares = evenShares(draft.value.entries.length)
  draft.value.entries.forEach((e, i) => (e.share = String(shares[i])))
}
/** A member's comment field, by the id it is focused by. */
const commentId = (id: string) => `peer-comment-${id}`
/**
 * Opens a member's comment field in place of the button that asked for it,
 * and moves the focus into it: the button is gone, and the focus would
 * otherwise fall back to the page's top.
 */
async function openComment(id: string) {
  commenting.value = new Set([...commenting.value, id])
  await nextTick()
  document.getElementById(commentId(id))?.focus()
}
/** Who reads a comment about a member: their teachers, never that member; about oneself, their teachers. */
function commentPlaceholder(id: string): string {
  return id === me.value
    ? t('peer.task.commentSelfPlaceholder')
    : t('peer.task.commentPlaceholder', { name: nameOf(id) })
}

const submitW = useWrite('peer_review.submit')
/** Sent, and waiting for approval (a seat whose handing in waits for it). */
const proposed = ref(false)
async function submit() {
  tried.value = true
  const f = form.value
  if (!f || problems.value.length) return
  const out = await submitW.run(submitArgs(props.courseId, props.assignment.id, f, draft.value), {
    success: t('peer.task.submitted'),
    reasons: 'peer.refusal',
  })
  if (out?.status === 'proposed') proposed.value = true
  if (out || submitW.lastError.value?.code === 'failed_precondition') void state.reload()
}

// --- Once it closes: their own average, where the form shares it -------------------------------
const average = computed(() => task.value?.own_average ?? null)
const sharePct = computed(() => {
  const p = num(average.value?.share_percent)
  return (ui.locale, Number.isFinite(p) ? formatPct(p / 100, 0) : null)
})
const averageWithheld = computed(
  () => win.value === 'closed' && form.value?.share_with_students === 'own_average' && !average.value,
)
const windowTone = computed(() => (win.value === 'open' ? 'indigo' : 'neutral'))

defineExpose({ reload: () => state.reload() })
</script>

<template>
  <section v-if="shown && form && task" class="app-card peer-task" data-test="peer-task">
    <h2 class="app-card__title">
      <span>{{ t('peer.task.title') }}</span>
      <AppTag :tone="windowTone">{{ t(`peer.window.${win}`) }}</AppTag>
    </h2>

    <!-- When: open until, opening on hand-in or at a time, or closed. -->
    <p class="peer-task__when">
      <i18n-t v-if="win === 'open'" keypath="peer.task.openUntil" tag="span" scope="global">
        <template #at><TimeText :value="task.window.closes_at" cutoff /></template>
        <template #rel><TimeText :value="task.window.closes_at" relative /></template>
      </i18n-t>
      <i18n-t v-else-if="win === 'closed'" keypath="peer.task.closedAt" tag="span" scope="global">
        <template #at><TimeText :value="task.window.closes_at" cutoff /></template>
      </i18n-t>
      <i18n-t
        v-else-if="task.window.opens === 'at' && task.window.opens_at"
        keypath="peer.task.opensAt"
        tag="span"
        scope="global"
      >
        <template #at><TimeText :value="task.window.opens_at" /></template>
        <template #closes><TimeText :value="task.window.closes_at" cutoff /></template>
      </i18n-t>
      <i18n-t v-else keypath="peer.task.opensOnHandIn" tag="span" scope="global">
        <template #closes><TimeText :value="task.window.closes_at" cutoff /></template>
      </i18n-t>
    </p>

    <el-alert v-if="form.enabled === false" type="warning" :closable="false" show-icon class="peer-task__alert">
      {{ t('peer.task.off') }}
    </el-alert>
    <AppNote v-else-if="nobody" class="peer-task__alert" data-test="peer-nobody">
      {{ t('peer.task.nobody', { group: task.group_name }) }}
    </AppNote>
    <AppNote v-else class="peer-task__alert">
      <p class="peer-task__para">
        {{
          rating
            ? t(form.self_evaluation ? 'peer.task.whatRatingSelf' : 'peer.task.whatRating', {
                group: task.group_name,
                min: form.scale_min ?? 0,
                max: form.scale_max ?? 0,
              })
            : t(form.self_evaluation ? 'peer.task.whatShareSelf' : 'peer.task.whatShare', { group: task.group_name })
        }}
      </p>
      <p class="peer-task__para">{{ t('peer.task.private') }}</p>
      <p class="peer-task__para">
        {{
          formCounts(form)
            ? t('peer.task.counts', { weight: formatPct(form.weight / 100, 0) })
            : t('peer.task.reference')
        }}
      </p>
    </AppNote>
    <AppNote v-if="course.isDelegate" plain class="peer-task__alert">{{ t('peer.task.agent') }}</AppNote>
    <AppNote v-if="proposed" class="peer-task__alert" closable @close="proposed = false">
      {{ t('peer.task.proposed') }}
    </AppNote>

    <!-- Their own average, once it has closed, where the form shares it. -->
    <div v-if="!nobody && win === 'closed' && average" class="peer-task__average" data-test="peer-own-average">
      <h3 class="peer-task__subtitle">{{ t('peer.task.average') }}</h3>
      <p v-if="!rating && sharePct" class="peer-task__para">
        {{ t('peer.task.averageShare', { pct: sharePct, even: formatPct(1, 0) }) }}
      </p>
      <template v-else-if="rating">
        <p class="peer-task__para">
          {{ t('peer.task.averageRating', { min: form.scale_min ?? 0, max: form.scale_max ?? 0 }) }}
        </p>
        <dl class="peer-task__averages">
          <div v-for="c in criteria" :key="c.key" class="peer-task__average-row">
            <dt>{{ c.label }}</dt>
            <dd>{{ formatDecimal(average.averages?.[c.key] ?? null) }}</dd>
          </div>
        </dl>
      </template>
    </div>
    <p v-else-if="!nobody && averageWithheld" class="app-form-hint peer-task__para">
      {{ t('peer.task.averageWithheld') }}
    </p>

    <!-- The evaluation: none for someone with nobody to evaluate. -->
    <div v-if="!nobody && (win !== 'not_open' || sheet)" class="peer-task__status">
      <i18n-t v-if="sheet" keypath="peer.task.submittedAt" tag="span" scope="global">
        <template #at><TimeText :value="sheet.submitted_at" /></template>
      </i18n-t>
      <span v-else>{{ win === 'closed' ? t('peer.task.noneWritten') : t('peer.task.notSubmitted') }}</span>
    </div>

    <form v-if="!nobody && (win === 'open' || sheet)" class="peer-task__sheet" @submit.prevent="submit">
      <!-- A share form: 100 points split among those evaluated. -->
      <template v-if="!rating">
        <ul class="peer-task__shares">
          <li v-for="e in draft.entries" :key="e.memberId" class="peer-task__entry">
            <div class="peer-task__share-row">
              <label :for="`peer-share-${e.memberId}`" class="peer-task__name">
                {{ nameOf(e.memberId)
                }}<span v-if="e.memberId === me" class="app-you">{{ t('common.labels.youTag') }}</span>
              </label>
              <el-input
                :id="`peer-share-${e.memberId}`"
                v-model="e.share"
                inputmode="numeric"
                class="peer-task__points"
                :disabled="!canWrite"
                :aria-label="t('peer.task.pointsFor', { name: nameOf(e.memberId) })"
                :data-test="`peer-share-${e.memberId}`"
              >
                <template #append>{{ t('peer.task.points') }}</template>
              </el-input>
            </div>
            <el-input
              v-if="commenting.has(e.memberId)"
              v-model="e.comment"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :maxlength="MAX_ENTRY_COMMENT"
              :disabled="!canWrite"
              :id="commentId(e.memberId)"
              :aria-label="t('peer.task.commentFor', { name: nameOf(e.memberId) })"
              :placeholder="commentPlaceholder(e.memberId)"
              class="peer-task__comment"
            />
            <el-button
              v-else-if="canWrite"
              link
              type="primary"
              class="peer-task__add-comment"
              @click="openComment(e.memberId)"
            >
              {{ t('peer.task.addComment', { name: nameOf(e.memberId) }) }}
            </el-button>
          </li>
        </ul>
        <div class="peer-task__total" data-test="peer-total">
          <span class="peer-task__total-figure">{{ t('peer.task.total', { total, of: SHARE_TOTAL }) }}</span>
          <AppTag v-if="total === SHARE_TOTAL" tone="done">{{ t('peer.task.totalOk') }}</AppTag>
          <AppTag v-else-if="total < SHARE_TOTAL" tone="wait">{{
            t('peer.task.totalShort', { n: SHARE_TOTAL - total })
          }}</AppTag>
          <AppTag v-else tone="danger">{{ t('peer.task.totalOver', { n: total - SHARE_TOTAL }) }}</AppTag>
          <span class="app-toolbar__spacer" />
          <el-button v-if="canWrite" size="small" @click="splitEvenly">{{ t('peer.task.evenly') }}</el-button>
        </div>
      </template>

      <!-- A rating form: every member on every criterion. -->
      <template v-else>
        <ul class="peer-task__ratings">
          <li v-for="e in draft.entries" :key="e.memberId" class="peer-task__entry peer-task__rated">
            <h3 class="peer-task__name peer-task__name--head">
              {{ nameOf(e.memberId)
              }}<span v-if="e.memberId === me" class="app-you">{{ t('common.labels.youTag') }}</span>
            </h3>
            <div v-for="c in criteria" :key="c.key" class="peer-task__criterion">
              <div class="peer-task__criterion-label">
                <span>{{ c.label }}</span>
                <span v-if="c.description" class="app-form-hint peer-task__criterion-hint">{{ c.description }}</span>
              </div>
              <el-radio-group
                v-model="e.ratings[c.key]"
                :disabled="!canWrite"
                size="small"
                class="peer-task__scale"
                :aria-label="t('peer.task.ratingFor', { criterion: c.label, name: nameOf(e.memberId) })"
              >
                <el-radio-button v-for="n in scale" :key="n" :value="n">{{ n }}</el-radio-button>
              </el-radio-group>
            </div>
            <el-input
              v-if="commenting.has(e.memberId)"
              v-model="e.comment"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :maxlength="MAX_ENTRY_COMMENT"
              :disabled="!canWrite"
              :id="commentId(e.memberId)"
              :aria-label="t('peer.task.commentFor', { name: nameOf(e.memberId) })"
              :placeholder="commentPlaceholder(e.memberId)"
              class="peer-task__comment"
            />
            <el-button
              v-else-if="canWrite"
              link
              type="primary"
              class="peer-task__add-comment"
              @click="openComment(e.memberId)"
            >
              {{ t('peer.task.addComment', { name: nameOf(e.memberId) }) }}
            </el-button>
          </li>
        </ul>
      </template>

      <div v-if="canWrite || draft.comment" class="peer-task__overall">
        <label for="peer-overall" class="peer-task__label">{{ t('peer.task.overall') }}</label>
        <el-input
          id="peer-overall"
          v-model="draft.comment"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 8 }"
          :maxlength="MAX_SHEET_COMMENT"
          :disabled="!canWrite"
          :placeholder="t('peer.task.overallPlaceholder')"
        />
      </div>

      <el-alert
        v-if="tried && problemLines.length"
        type="warning"
        :closable="false"
        show-icon
        class="peer-task__problems"
      >
        <ul class="peer-task__problem-list">
          <li v-for="p in problemLines" :key="p">{{ p }}</li>
        </ul>
      </el-alert>

      <div v-if="canWrite" class="peer-task__actions">
        <span class="app-form-hint peer-task__hint">{{ t('peer.task.changeUntil') }}</span>
        <span class="app-toolbar__spacer" />
        <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" />
        <el-button
          type="primary"
          native-type="submit"
          :loading="submitW.pending.value"
          :disabled="unchanged"
          data-test="peer-submit"
        >
          <el-icon><Promotion /></el-icon>
          <span>{{ sheet ? t('peer.task.resubmit') : t('peer.task.submit') }}</span>
        </el-button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.peer-task .app-card__title {
  justify-content: flex-start;
}
.peer-task__when {
  margin: 0 0 12px;
  font-size: var(--app-text-md);
}
.peer-task__alert {
  margin-bottom: 12px;
}
.peer-task__para {
  margin: 0;
  line-height: var(--app-lh-text);
}
.peer-task__para + .peer-task__para {
  margin-top: 6px;
}
.peer-task__subtitle {
  margin: 0 0 6px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.peer-task__average {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
  background: var(--app-neutral-bg);
  color: var(--app-ink);
}
.peer-task__averages {
  margin: 8px 0 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 16px;
}
.peer-task__average-row {
  display: contents;
}
.peer-task__averages dd {
  margin: 0;
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.peer-task__status {
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
  margin-bottom: 8px;
}
.peer-task__shares,
.peer-task__ratings {
  list-style: none;
  margin: 0;
  padding: 0;
}
.peer-task__entry {
  padding: 10px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
.peer-task__share-row {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  flex-wrap: wrap;
}
.peer-task__name {
  font-weight: var(--app-weight-strong);
  font-size: var(--app-text-md);
  overflow-wrap: anywhere;
}
.peer-task__name--head {
  margin: 0 0 8px;
}
.peer-task__points {
  width: 140px;
}
.peer-task__comment {
  margin-top: 8px;
}
.peer-task__add-comment {
  margin-top: 4px;
  font-size: var(--app-text-sm);
}
.peer-task__total {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.peer-task__total-figure {
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
.peer-task__criterion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  flex-wrap: wrap;
  padding: 6px 0;
}
.peer-task__criterion-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 180px;
  font-size: var(--app-text-sm);
}
.peer-task__criterion-hint {
  margin-top: 2px;
}
.peer-task__scale {
  flex-wrap: wrap;
}
.peer-task__overall {
  margin-top: 12px;
}
.peer-task__label {
  display: block;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
  margin-bottom: 4px;
}
.peer-task__problems {
  margin-top: 12px;
}
.peer-task__problem-list {
  margin: 0;
  padding-left: 1.25em;
}
.peer-task__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.peer-task__hint {
  margin-top: 0;
}
</style>
