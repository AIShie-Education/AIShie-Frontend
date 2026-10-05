<script setup lang="ts">
// What an action about peer evaluation proposed or did, on its page:
// counting it in grades (grade.apply_peer) by each member's factor as the
// proposal recorded it, said in words (what they received against an even
// share), or the score each grade went from and to once carried out; a
// change of a peer form (peer_form.set) as the form it makes.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'
import { formatDecimal, formatPct } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import MemberName from '@/components/MemberName.vue'
import { isObject, payloadOf, routeFor, str, type ActionRow } from '@/views/course/actions/components/actionText'
import PeerFormSummary from './PeerFormSummary.vue'
import { num, type FormLike } from './peer'

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
.peer-proposal__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
</style>
