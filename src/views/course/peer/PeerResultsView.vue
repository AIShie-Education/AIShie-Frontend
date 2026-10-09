<script setup lang="ts">
// An assignment's peer evaluation, for those who grade
// (/courses/:courseId/assignments/:assignmentId/peer, peer_review.results):
// every group whose circle lies wholly within the caller's student scope,
// each member's evaluation, what they received and their factor in words,
// the score it gives at the form's weight, their grade now, Core's flags and
// who has written nothing; every evaluation with who wrote it and their
// comments; the fair-share factor explained; the results as CSV; and,
// for whoever both enters and posts grades, counting it in grades
// (ApplyPeerDialog). Students never reach it: Core refuses them the results,
// and the page says they are for those who grade.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useCourseTab } from '@/composables/useCourseTab'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList, formatPct } from '@/utils/format'
import AppEmpty from '@/components/AppEmpty.vue'
import AppNote from '@/components/AppNote.vue'
import AsyncState from '@/components/AsyncState.vue'
import DataFlowNotice from '@/components/DataFlowNotice.vue'
import FilterChips from '@/components/FilterChips.vue'
import PageHeader from '@/components/PageHeader.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import StatusTag from '@/components/StatusTag.vue'
import ApplyPeerDialog from './ApplyPeerDialog.vue'
import FairShareExplainer from './FairShareExplainer.vue'
import PeerFormSummary from './PeerFormSummary.vue'
import PeerGroupResults from './PeerGroupResults.vue'
import { formCounts } from './peer'
import { flaggedGroup, missingIn, peerCsv } from './peerResults'

const props = defineProps<{ courseId: string; assignmentId: string }>()
const { t } = useI18n()
const course = useCourseStore()
const ui = useUiStore()
useCourseTab(() => 'course-assignments')

const assignment = useAsync(
  () => read('assignment.get', { course_id: props.courseId, assignment_id: props.assignmentId }),
  { watch: [() => props.assignmentId], keepData: true },
)
const results = useAsync(
  () => read('peer_review.results', { course_id: props.courseId, assignment_id: props.assignmentId }),
  { watch: [() => props.assignmentId], keepData: true },
)
const data = computed(() => results.data.value ?? null)
const noForm = computed(() => results.error.value?.details?.reason === 'no_peer_form')
const groups = computed(() => data.value?.groups ?? [])

type Show = 'flagged' | 'missing'
const show = ref<Show | ''>('')
const shown = computed(() =>
  groups.value.filter((g) =>
    show.value === 'flagged' ? flaggedGroup(g) : show.value === 'missing' ? missingIn(g).length > 0 : true,
  ),
)
const chips = computed(() => [
  {
    value: 'flagged' as const,
    label: t('peer.results.filter.flagged'),
    count: groups.value.filter(flaggedGroup).length,
  },
  {
    value: 'missing' as const,
    label: t('peer.results.filter.missing'),
    count: groups.value.filter((g) => missingIn(g).length > 0).length,
  },
])

/** Counting it in grades is a regrade's: it takes entering and posting grades. */
const counter = computed(() => course.canAll(['grade_submit', 'grade_post']))
const applyOpen = ref(false)
const outcome = ref<{ status: 'executed' | 'proposed'; written: number } | null>(null)
function onApplied(o: { status: 'executed' | 'proposed'; written: number }) {
  outcome.value = o
  void results.reload()
}

function reload() {
  void assignment.reload()
  void results.reload()
}

function exportCsv() {
  const r = data.value
  if (!r) return
  const csv = peerCsv(r, {
    group: t('peer.csv.group'),
    member: t('peer.csv.member'),
    wrote: t('peer.csv.wrote'),
    wroteAt: t('peer.csv.wroteAt'),
    raters: t('peer.csv.raters'),
    averageShare: t('peer.csv.averageShare'),
    criterion: (label) => t('peer.csv.criterion', { label }),
    self: t('peer.csv.self'),
    factor: t('peer.csv.factor'),
    factorSelf: t('peer.csv.factorSelf'),
    peerFactor: t('peer.csv.peerFactor'),
    score: t(formCounts(r.form) ? 'peer.csv.score' : 'peer.csv.scoreIfCounted', {
      weight: (ui.locale, formatPct(r.form.weight / 100, 0)),
    }),
    groupScore: t('peer.csv.groupScore'),
    grade: t('peer.csv.grade'),
    flags: t('peer.csv.flags'),
    yes: t('common.labels.yes'),
    no: t('common.labels.no'),
    flag: (f) => t(`peer.flag.${f}`),
    list: (items) => (ui.locale, formatList(items)),
    gradeNow: (score, state, own) =>
      own
        ? t('peer.csv.gradeOwn', { score })
        : t(`peer.csv.grade_${state === 'posted' ? 'posted' : 'draft'}`, { score }),
  })
  const code = [course.course?.code, course.course?.section].filter(Boolean).join('-')
  const title = assignment.data.value?.title ?? ''
  const day = new Date().toLocaleDateString('sv-SE')
  const name = `${[code, title, t('peer.csv.file'), day].filter(Boolean).join('-')}.csv`.replace(
    /[\\/:*?"<>|\s]+/g,
    '_',
  )
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="peer-results">
    <PageHeader
      :title="t('peer.results.title')"
      :subtitle="assignment.data.value?.title"
      :back="{ name: 'course-assignment', params: { courseId, assignmentId } }"
    >
      <template v-if="data">
        <el-button :disabled="!groups.length" @click="exportCsv">
          <el-icon><Download /></el-icon>
          <span>{{ t('peer.results.csv') }}</span>
        </el-button>
        <el-button
          v-if="counter"
          type="primary"
          :disabled="!course.writable"
          data-test="peer-count"
          @click="applyOpen = true"
        >
          <el-icon><Finished /></el-icon>
          <span>{{ t('peer.results.count') }}</span>
        </el-button>
        <StatusTag
          v-if="counter && course.needsApprovalAll(['grade_submit', 'grade_post'])"
          vocab="level"
          value="confirm_required"
          class="peer-results__approval"
        />
      </template>
    </PageHeader>

    <!-- What the CSV takes with it, beside the button that downloads it. -->
    <DataFlowNotice v-if="data && groups.length" compact class="peer-results__flow">
      {{ t('peer.results.csvNotice') }}
    </DataFlowNotice>
    <AppNote v-if="outcome" closable class="peer-results__note" @close="outcome = null">
      <template v-if="outcome.status === 'proposed'">
        {{ t('peer.apply.proposed') }}
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
          t('peer.settings.myActions')
        }}</router-link>
      </template>
      <template v-else>{{
        outcome.written ? t('peer.apply.done', { n: outcome.written }, outcome.written) : t('peer.apply.doneNone')
      }}</template>
    </AppNote>

    <AppEmpty v-if="noForm" page :title="t('peer.results.noFormTitle')" :text="t('peer.results.noForm')">
      <router-link :to="{ name: 'course-assignment', params: { courseId, assignmentId } }">
        <el-button>{{ t('peer.results.toAssignment') }}</el-button>
      </router-link>
    </AppEmpty>
    <AsyncState v-else :loading="results.loading.value && !data" :error="results.error.value" @retry="reload">
      <template v-if="data">
        <div class="peer-results__layout app-columns">
          <div class="app-column peer-results__main">
            <section class="app-card">
              <div class="app-toolbar">
                <FilterChips
                  v-model="show"
                  :options="chips"
                  :all-count="groups.length"
                  :label="t('peer.results.filter.label')"
                />
                <span class="app-toolbar__spacer" />
                <RefreshButton :loading="results.loading.value" @click="reload" />
              </div>
              <AppEmpty v-if="!groups.length" :text="t('peer.results.empty')" />
              <AppEmpty v-else-if="!shown.length" :text="t('peer.results.emptyFilter')" />
              <div v-for="g in shown" :key="g.group_id" class="peer-results__group">
                <PeerGroupResults :course-id="courseId" :form="data.form" :group="g" />
              </div>
            </section>
          </div>
          <aside class="app-column peer-results__side">
            <section class="app-card">
              <h2 class="app-card__title">{{ t('peer.results.form') }}</h2>
              <PeerFormSummary :form="data.form" />
            </section>
            <section class="app-card">
              <h2 class="app-card__title">{{ t('peer.fair.title') }}</h2>
              <FairShareExplainer
                :form="data.form"
                :group-score="groups.find((g) => g.group_score !== null && g.group_score !== undefined)?.group_score"
                :points="assignment.data.value?.points_possible"
              />
            </section>
          </aside>
        </div>
        <ApplyPeerDialog
          v-if="counter"
          v-model:visible="applyOpen"
          :course-id="courseId"
          :assignment-id="assignmentId"
          :results="data"
          @done="onApplied"
        />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.peer-results {
  container-type: inline-size;
}
.peer-results__approval {
  align-self: center;
}
.peer-results__flow {
  margin-bottom: 12px;
}
.peer-results__note {
  margin-bottom: 16px;
}
.peer-results__note a {
  margin-left: 6px;
}
.peer-results__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
}
.peer-results__group + .peer-results__group {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color);
}
/* Two columns while the main one keeps 420 px or more beside the 320 px one. */
@container (max-width: 759px) {
  .peer-results__layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .app-card {
    padding: 14px;
  }
}
</style>
