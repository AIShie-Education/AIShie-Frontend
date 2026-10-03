<script setup lang="ts">
// 匯出對話 (Export conversations): root, the platform's administrators and a
// department's administrators export conversations for audit
// (conversation.export), as two files, JSON Lines and CSV, kept by Core for a
// while and downloaded from short-lived links. A platform administrator
// exports a course's, a department's (with those beneath it) or the whole
// site's; a department's administrator a course or a department of theirs.
// Either may keep to one participant and to a span of days on this browser's
// calendar.
//
// An export may take minutes, and goes on while the caller looks at another
// page (conversationExport.ts keeps it). One that got no answer is asked for
// again under the same key, after a reload too, so that Core gives what it
// made rather than export twice. What came of it shows under the form: its
// counts and files with the notice that they hold personal data, or Core's
// refusal in the reader's words. The exports this browser remembers for the
// caller are listed under it, until their files are deleted.
import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { errorMessage } from '@/composables/useErrors'
import { useSessionStore } from '@/stores/session'
import { shortId } from '@/utils/format'
import { formatCountdown } from '@/utils/countdown'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import DataFlowNotice from '@/components/DataFlowNotice.vue'
import PageHeader from '@/components/PageHeader.vue'
import DepartmentPicker from './departments/DepartmentPicker.vue'
import CoursePicker from './export/CoursePicker.vue'
import ParticipantPicker from './export/ParticipantPicker.vue'
import ExportFiles from './export/ExportFiles.vue'
import ExportSummary from './export/ExportSummary.vue'
import RecentExports from './export/RecentExports.vue'
import {
  departmentChoices,
  emptyForm,
  endOfDayExclusive,
  exportErrorText,
  exportRecord,
  forgetExport,
  forgetPending,
  formProblems,
  lastRun,
  pendingExport,
  rememberedExports,
  scopeChoices,
  spanWords,
  startExport,
  startOfDay,
  timeZone,
  tooLargeOf,
  unanswered,
  type ExportForm,
  type ExportLabels,
  type FormProblem,
  type RememberedExport,
  type ScopeKind,
} from './export/conversationExport'
import { zonedText } from '@/utils/parts'

const { t } = useI18n()
const session = useSessionStore()
const actorId = computed(() => session.me?.id ?? '')
const choices = computed(() => scopeChoices(session))
const tree = useDepartmentTree()
const deptData = computed(() => departmentChoices(tree.tree.value))

// --- The form ---------------------------------------------------------------------------------

/** The export this page last asked for, if it is this caller's: under way, made, or refused. */
const run = computed(() => (lastRun.value && lastRun.value.actorId === actorId.value ? lastRun.value : null))
/** An export asked for in this tab and not answered before the page was left: shown again, to ask again. */
const pending = ref(!run.value && actorId.value ? pendingExport(actorId.value) : null)

const first = run.value ?? pending.value
const form = reactive<ExportForm>(first ? { ...first.form } : emptyForm())
const labels = reactive<ExportLabels>(first ? { ...first.labels } : {})
if (!choices.value.includes(form.scope)) form.scope = choices.value[0] ?? 'course'

const running = computed(() => run.value?.state === 'running')
const tried = ref(false)
const problems = computed(() => formProblems(form, choices.value))
const shownProblems = computed<FormProblem[]>(() => (tried.value ? problems.value : []))
const has = (p: FormProblem) => shownProblems.value.includes(p)

// A scope's choice goes with it: switching back finds it empty.
watch(
  () => form.scope,
  () => {
    form.courseId = ''
    form.deptId = ''
    labels.scope = undefined
  },
)
// The department's words are the tree's.
watch(
  () => form.deptId,
  (id) => {
    if (form.scope === 'department') labels.scope = id ? tree.pathLabel(id) : undefined
  },
)
// Anything changed is another export: what was not answered is not this one.
watch(
  () => JSON.stringify(form),
  () => (pending.value = null),
)

const zone = timeZone()
const dateProblem = computed(() => !!form.fromDate && !!form.toDate && form.toDate < form.fromDate)
/** The days, as Core is sent them: from midnight at the start of the first, before midnight at the end of the last. */
const sent = computed(() => {
  if (dateProblem.value) return null
  return {
    from: form.fromDate ? startOfDay(form.fromDate) : null,
    before: form.toDate ? endOfDayExclusive(form.toDate) : null,
  }
})
const spanText = computed(() => (sent.value ? spanWords(sent.value.from, sent.value.before) : ''))
const disableBeforeFrom = (d: Date) => !!form.fromDate && dayjs(d).format('YYYY-MM-DD') < form.fromDate
const disableAfterTo = (d: Date) => !!form.toDate && dayjs(d).format('YYYY-MM-DD') > form.toDate

const scopeLabels = computed(() => ({ ...labels, scope: form.scope === 'site' ? undefined : labels.scope }))

async function submit() {
  tried.value = true
  if (problems.value.length || running.value || !actorId.value) return
  pending.value = null
  await startExport(actorId.value, form, scopeLabels.value)
}

/** Forgets the export not answered, and what the form showed of it. */
function discardPending() {
  if (actorId.value) forgetPending(actorId.value)
  Object.assign(form, emptyForm(choices.value[0] ?? 'course'))
  labels.scope = undefined
  labels.participant = undefined
  tried.value = false
  pending.value = null
}

// --- While it runs ----------------------------------------------------------------------------

const tick = ref(Date.now())
const timer = setInterval(() => (tick.value = Date.now()), 1000)
onScopeDispose(() => clearInterval(timer))
const elapsed = computed(() => (run.value ? formatCountdown(Math.max(0, tick.value - run.value.startedAt)) : ''))

/** The card under the form that says how the export goes: under way, made, or refused. */
const news = ref<HTMLElement | null>(null)
// It is brought into view as it changes, below a form that may fill the screen.
watch(
  () => run.value?.state,
  async (now, before) => {
    if (!now || now === before) return
    await nextTick()
    news.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  },
)

// --- What came of it --------------------------------------------------------------------------

const outcome = computed<RememberedExport | null>(() => {
  const r = run.value
  if (r?.state !== 'done' || !r.exported) return null
  return exportRecord(r.exported.result, { scope: r.form.scope, labels: r.labels, args: r.args })
})
const refusal = computed(() => (run.value?.state === 'failed' ? (run.value.error ?? null) : null))
const tooLarge = computed(() => tooLargeOf(refusal.value))
const noAnswer = computed(() => !!refusal.value && unanswered(refusal.value))
const refusalText = computed(() => (refusal.value ? exportErrorText(refusal.value) : ''))

// --- Recent exports ---------------------------------------------------------------------------

const recent = ref<RememberedExport[]>(actorId.value ? rememberedExports(actorId.value) : [])
watch(actorId, (id) => (recent.value = id ? rememberedExports(id) : []))
// A run that ends while the page is shown, or ended while it was not, is among them.
watch(
  () => run.value?.state,
  (s) => {
    if (s === 'done' && actorId.value) recent.value = rememberedExports(actorId.value)
  },
)
const recentShown = computed(() => recent.value.filter((r) => r.export_id !== outcome.value?.export_id))

function forget(exportId: string) {
  if (!actorId.value) return
  recent.value = forgetExport(actorId.value, exportId)
}
function gone(exportId: string, said = true) {
  forget(exportId)
  if (said) ElMessage({ type: 'info', message: t('auditExport.recent.gone') })
}

const scopeOptions = computed(() =>
  choices.value.map((s: ScopeKind) => ({ value: s, label: t(`auditExport.scope.${s}`) })),
)
</script>

<template>
  <div class="export-page">
    <PageHeader
      :title="t('auditExport.title')"
      :subtitle="session.isAdmin ? t('auditExport.subtitle') : t('auditExport.subtitleDept')"
    />

    <section class="app-card export-form" aria-labelledby="export-form-title">
      <h2 id="export-form-title" class="app-card__title">{{ t('auditExport.form.title') }}</h2>
      <p class="app-muted export-form__intro">{{ t('auditExport.form.intro') }}</p>

      <AppNote
        v-if="pending"
        :title="t('auditExport.pending.title', { time: dayjs(pending.at).format('HH:mm') })"
        class="export-form__pending"
      >
        <div class="export-form__pending-body">
          <span>{{ t('auditExport.pending.body') }}</span>
          <el-button size="small" link type="primary" @click="discardPending">{{
            t('auditExport.pending.discard')
          }}</el-button>
        </div>
      </AppNote>

      <el-form label-position="top" :disabled="running" @submit.prevent>
        <el-form-item :label="t('auditExport.form.scope')" class="export-form__scope">
          <el-radio-group v-model="form.scope" class="export-form__scopes">
            <el-radio-button v-for="o in scopeOptions" :key="o.value" :value="o.value">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item
          v-if="form.scope === 'course'"
          :label="t('auditExport.form.course')"
          for="export-course"
          :error="has('course') ? t('auditExport.problem.course') : ''"
        >
          <CoursePicker id="export-course" v-model="form.courseId" v-model:label="labels.scope" :disabled="running" />
        </el-form-item>
        <el-form-item
          v-else-if="form.scope === 'department'"
          :label="t('auditExport.form.department')"
          for="export-dept"
          :error="has('department') ? t('auditExport.problem.department') : ''"
        >
          <DepartmentPicker
            id="export-dept"
            v-model="form.deptId"
            :data="deptData"
            :disabled="running"
            :placeholder="t('auditExport.form.departmentPlaceholder')"
          />
          <div class="app-form-hint">{{ t('auditExport.form.departmentHint') }}</div>
          <div v-if="tree.error.value && !tree.loaded.value" class="export-form__load-error" role="alert">
            <span>{{ errorMessage(tree.error.value) }}</span>
            <el-button size="small" link type="primary" :loading="tree.loading.value" @click="tree.reload()">
              {{ t('common.actions.retry') }}
            </el-button>
          </div>
        </el-form-item>
        <div v-else class="export-form__site app-form-hint">{{ t('auditExport.form.siteHint') }}</div>

        <el-form-item :label="t('auditExport.form.participant')" for="export-participant">
          <ParticipantPicker
            id="export-participant"
            v-model="form.participantId"
            v-model:label="labels.participant"
            :platform="session.isAdmin"
            :disabled="running"
          />
          <div class="app-form-hint">
            {{ session.isAdmin ? t('auditExport.form.participantHint') : t('auditExport.form.participantHintDept') }}
          </div>
        </el-form-item>

        <div class="export-form__dates">
          <el-form-item :label="t('auditExport.form.from')" for="export-from">
            <el-date-picker
              id="export-from"
              v-model="form.fromDate"
              type="date"
              value-format="YYYY-MM-DD"
              :disabled-date="disableAfterTo"
              :placeholder="t('auditExport.form.anyStart')"
              clearable
              class="export-form__date"
            />
          </el-form-item>
          <el-form-item
            :label="t('auditExport.form.to')"
            for="export-to"
            :error="has('dates') ? t('auditExport.problem.dates') : ''"
          >
            <el-date-picker
              id="export-to"
              v-model="form.toDate"
              type="date"
              value-format="YYYY-MM-DD"
              :disabled-date="disableBeforeFrom"
              :placeholder="t('auditExport.form.anyEnd')"
              clearable
              class="export-form__date"
            />
          </el-form-item>
        </div>
        <div class="export-form__span" aria-live="polite">
          <div v-if="spanText" class="export-form__span-words">{{ spanText }}</div>
          <div class="app-form-hint">
            {{
              zone.name
                ? t('auditExport.form.zone', { zone: zone.name, offset: zone.offset })
                : t('auditExport.form.zoneOffset', { offset: zone.offset })
            }}
          </div>
          <div v-if="sent && (sent.from || sent.before)" class="app-form-hint export-form__sent">
            {{ t('auditExport.form.sent') }}
            <code v-if="sent.from" class="app-mono">from {{ sent.from }}</code>
            <code v-if="sent.before" class="app-mono">before {{ sent.before }}</code>
          </div>
        </div>

        <div class="export-form__actions">
          <el-button type="primary" class="export-form__submit" :loading="running" :disabled="running" @click="submit">
            <el-icon v-if="!running"><Download /></el-icon>
            <span>{{ running ? t('auditExport.form.exporting') : t('auditExport.form.submit') }}</span>
          </el-button>
        </div>
      </el-form>
    </section>

    <section v-if="running" ref="news" class="app-card export-running" role="status" aria-live="polite">
      <h2 class="app-card__title">{{ t('auditExport.running.title') }}</h2>
      <el-progress :percentage="50" :indeterminate="true" :show-text="false" :duration="2" />
      <p class="export-running__time">{{ t('auditExport.running.elapsed', { time: elapsed }) }}</p>
      <p class="app-muted export-running__note">{{ t('auditExport.running.note') }}</p>
    </section>

    <section
      v-else-if="outcome && run?.exported"
      ref="news"
      class="app-card export-outcome"
      aria-labelledby="export-outcome-title"
    >
      <h2 id="export-outcome-title" class="app-card__title">
        <span>{{ t('auditExport.outcome.title') }}</span>
        <AppTag v-if="run.exported.replayed">{{ t('auditExport.outcome.replayed') }}</AppTag>
      </h2>
      <ExportSummary :record="outcome" />
      <DataFlowNotice class="export-outcome__privacy" :title="t('auditExport.privacy.title')">
        <i18n-t keypath="auditExport.privacy.body" tag="p" scope="global" class="export-outcome__privacy-body">
          <template #time
            ><strong>{{ zonedText(outcome.expires_at) }}</strong></template
          >
        </i18n-t>
      </DataFlowNotice>
      <ExportFiles
        :export-id="outcome.export_id"
        :files="outcome.files"
        :expires-at="outcome.expires_at"
        @gone="gone(outcome.export_id, false)"
      />
      <p class="app-muted export-outcome__record">
        {{ t('auditExport.outcome.recorded', { id: shortId(outcome.export_id) }) }}
      </p>
    </section>

    <section v-else-if="refusal" ref="news" class="app-card export-refusal" role="alert">
      <el-alert
        :type="noAnswer ? 'warning' : 'error'"
        show-icon
        :closable="false"
        :title="noAnswer ? t('auditExport.refused.noAnswer') : t('auditExport.refused.title')"
      >
        <p class="export-refusal__text">{{ noAnswer ? t('auditExport.refused.noAnswerBody') : refusalText }}</p>
        <ul v-if="tooLarge" class="export-refusal__narrow">
          <li v-if="form.scope !== 'course'">{{ t('auditExport.tooLarge.course') }}</li>
          <li v-if="!form.participantId">{{ t('auditExport.tooLarge.participant') }}</li>
          <li>{{ t('auditExport.tooLarge.days') }}</li>
        </ul>
        <p v-if="refusal.recorded" class="export-refusal__record">
          {{ t('common.errors.recordedAs', { id: shortId(refusal.actionId) }) }}
        </p>
      </el-alert>
    </section>

    <RecentExports v-if="recentShown.length" :list="recentShown" @forget="forget" @gone="gone" />
  </div>
</template>

<style scoped>
.export-page {
  max-width: 960px;
}
.export-form__intro {
  margin: -8px 0 16px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.export-form__pending {
  margin-bottom: 16px;
}
.export-form__pending-body {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
}
.export-form__scopes {
  flex-wrap: wrap;
}
.export-form__load-error {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: var(--app-text-sm);
  color: var(--el-color-danger);
}
.export-form__site {
  margin: -8px 0 18px;
}
.export-form__dates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.export-form__date {
  width: 100%;
}
.export-form__dates :deep(.el-date-editor.el-input) {
  width: 100%;
}
.export-form__span {
  margin: -8px 0 18px;
}
.export-form__span-words {
  font-size: var(--app-text-md);
}
.export-form__sent {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
}
.export-form__sent code {
  overflow-wrap: anywhere;
}
.export-form__actions {
  display: flex;
  justify-content: flex-end;
}
.export-running__time {
  margin: 12px 0 4px;
  font-variant-numeric: tabular-nums;
}
.export-running__note {
  margin: 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.export-outcome__privacy {
  margin: 16px 0;
}
.export-outcome__privacy-body {
  margin: 0;
  line-height: var(--app-lh-text);
}
.export-outcome__record {
  margin: 12px 0 0;
  font-size: var(--app-text-xs);
}
.export-refusal__text {
  margin: 0;
  line-height: var(--app-lh-text);
}
.export-refusal__narrow {
  margin: 8px 0 0;
  padding-left: 20px;
  line-height: var(--app-lh-text);
}
.export-refusal__record {
  margin: 8px 0 0;
  font-size: var(--app-text-xs);
}
@media (max-width: 640px) {
  /* The three scopes on one line of a phone. */
  .export-form__scopes :deep(.el-radio-button__inner) {
    padding-left: 10px;
    padding-right: 10px;
  }
  .export-form__dates {
    grid-template-columns: minmax(0, 1fr);
  }
  .export-form__actions .el-button {
    width: 100%;
  }
}
</style>
