<script setup lang="ts">
// What an action about peer evaluation proposed or did, on its page and its
// card in a queue: counting it in grades (grade.apply_peer) by each member's
// factor as the proposal recorded it, said in words (what they received
// against an even share), or the score each grade went from and to once
// carried out; a change of a peer form (peer_form.set) as the form it makes;
// and a student's evaluation (peer_review.submit, proposed where their
// handing in waits for approval) as what it gives each member of their
// group, by name, with their comments: each criterion by its label, read
// from the assignment's form, and each member by name, from the member list
// or, for the student themselves, from their group's circle.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import MemberName from '@/components/MemberName.vue'
import { isObject, payloadOf, routeFor, str, type ActionRow } from '@/views/course/actions/components/actionText'
import PeerFormSummary from './PeerFormSummary.vue'
import { criteriaOf, num, type FormLike } from './peer'

const props = defineProps<{ action: ActionRow; courseId: string }>()
const { t } = useI18n()
const ui = useUiStore()

const p = computed(() => payloadOf(props.action))
const kind = computed(() => props.action.action_type)

// --- grade.apply_peer --------------------------------------------------------------------
interface Pinned {
  grade_id: string
  student_member_id: string
  factor?: number | string | null
}
interface Written {
  student_member_id: string
  grade_id: string
  before: number | string
  score: number | string
  posted: boolean
}
const pinned = computed<Pinned[]>(() =>
  Array.isArray(p.value.grades)
    ? (p.value.grades as unknown[]).filter(isObject).map((g) => g as unknown as Pinned)
    : [],
)
const written = computed<Written[] | null>(() => {
  const r = props.action.result
  if (props.action.status !== 'executed' || !isObject(r) || !Array.isArray(r.written)) return null
  return (r.written as unknown[]).filter(isObject).map((w) => w as unknown as Written)
})
function factorWords(f: number | string | null | undefined): string {
  const n = num(f ?? null)
  return (
    ui.locale,
    Number.isFinite(n) ? t('peer.proposal.factor', { pct: formatPct(n, 0) }) : t('peer.proposal.takenAway')
  )
}
const gradeRoute = (id: string) => routeFor(props.courseId, 'grade_id', id)

// --- peer_form.set ------------------------------------------------------------------------
const form = computed<FormLike | null>(() => {
  const v = p.value
  if (kind.value !== 'peer_form.set' || !str(v.kind) || !str(v.closes_at)) return null
  return v as unknown as FormLike
})

// --- peer_review.submit ------------------------------------------------------------------
interface SheetEntry {
  student_member_id: string
  share?: number | null
  ratings?: Record<string, number> | null
  comment?: string | null
}
const sheet = computed(() => kind.value === 'peer_review.submit')
const entries = computed<SheetEntry[]>(() =>
  sheet.value && Array.isArray(p.value.entries)
    ? (p.value.entries as unknown[])
        .filter(isObject)
        .map((e) => e as unknown as SheetEntry)
        .filter((e) => typeof e.student_member_id === 'string')
    : [],
)
const sheetComment = computed(() => (sheet.value ? (str(p.value.comment)?.trim() ?? '') : ''))
/** The assignment's form, for its criteria's labels, and the student's circle, for names they may not read elsewhere. */
const peerForm = useAsync(
  async () => {
    const a = str(p.value.assignment_id)
    if (!sheet.value || !a) return null
    return read('peer_form.get', { course_id: props.courseId, assignment_id: a })
  },
  { watch: [() => props.action.id] },
)
const circle = computed(
  () => new Map((peerForm.data.value?.task?.circle ?? []).map((c) => [c.member_id, c.display_name])),
)
const labels = computed(() => new Map(criteriaOf(peerForm.data.value?.form).map((c) => [c.key, c.label])))
function entryText(e: SheetEntry): string {
  if (e.share !== null && e.share !== undefined) return t('peer.results.points', { n: e.share }, e.share)
  const ratings = e.ratings ?? {}
  // In the form's order where it can be read; otherwise as sent.
  const keys = labels.value.size ? [...labels.value.keys()].filter((k) => k in ratings) : Object.keys(ratings)
  return keys
    .map((k) => t('peer.results.ratingPair', { criterion: labels.value.get(k) ?? k, n: ratings[k] }))
    .join(t('common.sep'))
}
</script>

<template>
  <div class="peer-proposal">
    <template v-if="kind === 'grade.apply_peer'">
      <AppNote v-if="action.status === 'proposed'" plain class="peer-proposal__note">{{
        t('peer.proposal.applyIntro')
      }}</AppNote>
      <table v-if="written" class="peer-proposal__table">
        <thead>
          <tr>
            <th scope="col">{{ t('peer.apply.member') }}</th>
            <th scope="col" class="peer-proposal__num">{{ t('peer.proposal.before') }}</th>
            <th scope="col" class="peer-proposal__num">{{ t('peer.proposal.after') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="w in written" :key="w.grade_id">
            <th scope="row"><MemberName :id="w.student_member_id" /></th>
            <td class="peer-proposal__num">{{ formatDecimal(w.before) }}</td>
            <td class="peer-proposal__num">
              <router-link v-if="gradeRoute(w.grade_id)" :to="gradeRoute(w.grade_id)!">{{
                formatDecimal(w.score)
              }}</router-link>
              <span v-else>{{ formatDecimal(w.score) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="pinned.length" class="peer-proposal__table" data-test="peer-proposal-factors">
        <thead>
          <tr>
            <th scope="col">{{ t('peer.apply.member') }}</th>
            <th scope="col">{{ t('peer.proposal.factorHead') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in pinned" :key="g.grade_id">
            <th scope="row"><MemberName :id="g.student_member_id" /></th>
            <td>
              {{ factorWords(g.factor) }}
              <span v-if="g.factor !== null && g.factor !== undefined" class="app-muted">{{
                t('common.bracketed', { text: t('peer.results.factorExact', { f: formatDecimal(g.factor, 4) }) })
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="app-muted peer-proposal__none">{{ t('peer.proposal.noneRecorded') }}</p>
      <p v-if="typeof p.form_version === 'number'" class="app-form-hint">
        {{ t('peer.proposal.formVersion', { n: p.form_version }) }}
      </p>
    </template>
    <PeerFormSummary v-else-if="form" :form="form" />
    <template v-else-if="sheet">
      <AppNote v-if="action.status === 'proposed'" plain class="peer-proposal__note">{{
        t('peer.proposal.sheetIntro')
      }}</AppNote>
      <table v-if="entries.length" class="peer-proposal__table" data-test="peer-proposal-sheet">
        <thead>
          <tr>
            <th scope="col">{{ t('peer.apply.member') }}</th>
            <th scope="col">{{ t('peer.proposal.givenHead') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.student_member_id">
            <th scope="row">
              <span v-if="circle.get(e.student_member_id)">{{ circle.get(e.student_member_id) }}</span>
              <MemberName v-else :id="e.student_member_id" />
              <span v-if="e.student_member_id === action.member_id" class="app-muted">{{
                t('common.bracketed', { text: t('peer.proposal.self') })
              }}</span>
            </th>
            <td>
              {{ entryText(e) }}
              <div v-if="e.comment" class="peer-proposal__comment">{{ t('common.quoted', { text: e.comment }) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="sheetComment" class="peer-proposal__comment peer-proposal__overall">
        {{ t('common.pair', { label: t('peer.results.overall'), value: t('common.quoted', { text: sheetComment }) }) }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.peer-proposal__note {
  margin-bottom: 12px;
}
.peer-proposal__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--app-text-sm);
}
.peer-proposal__table th,
.peer-proposal__table td {
  padding: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
}
.peer-proposal__table thead th {
  color: var(--app-ink-3);
}
.peer-proposal__table tbody th {
  font-weight: 400;
}
.peer-proposal__table .peer-proposal__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.peer-proposal__table th,
.peer-proposal__table td {
  vertical-align: top;
}
.peer-proposal__comment {
  color: var(--app-ink-2);
  margin-top: 2px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.peer-proposal__overall {
  margin-top: 8px;
  font-size: var(--app-text-sm);
}
.peer-proposal__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
</style>
