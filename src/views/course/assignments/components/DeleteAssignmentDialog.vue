<script setup lang="ts">
// Deleting an assignment for good (assignment.delete). It cannot be undone:
// every submission to it goes, with their files, and every grade given on
// them; the totals it counted in are worked out again without it; proposals
// about it waiting are cancelled. Its instructions and rubric stay in the
// course as they are. The dialog first asks Core what would go with it
// (assignment.delete_preview) and lists the counts that are not nought; once
// anyone has started on it (a submission of any kind, or a grade), its title
// is typed to confirm, as the page shows it (titleMatches). The counts go back to Core unchanged as confirm, and a
// deletion that would take more than was shown is refused (confirm_stale):
// the dialog then counts again, says so, and asks for the title again. Core's
// other refusals are said here, in the dialog, by reason.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { read, type ApiError } from '@/api/http'
import type { AssignmentDeleteOut, AssignmentDeletePreview, AssignmentSummary } from '@/api/types'
import { toApiError } from '@/composables/useAsync'
import { errorMessage } from '@/composables/useErrors'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatList } from '@/utils/format'
import AppNote from '@/components/AppNote.vue'
import { goesLines, hasWork, isDeletedError, nothingGoes, titleAsRead, titleMatches } from './deletion'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  courseId: string
  assignment: Pick<AssignmentSummary, 'id' | 'title' | 'instructions_document_id' | 'rubric_document_id'>
}>()
const emit = defineEmits<{
  /** Deleted, at once: what went with it. */
  deleted: [result: AssignmentDeleteOut]
  /** The deletion waits for approval. */
  proposed: [actionId: string]
  /** It had been deleted already, elsewhere. */
  gone: []
}>()
const { t, te, locale } = useI18n()
const course = useCourseStore()
const { run, pending, lastError } = useWrite('assignment.delete')

const REASONS = 'assignments.delete.refusal'

// --- What goes with it -----------------------------------------------------------
const preview = ref<AssignmentDeletePreview | null>(null)
const previewError = ref<ApiError | null>(null)
const counting = ref(false)
let generation = 0

async function count() {
  const mine = ++generation
  counting.value = true
  previewError.value = null
  try {
    const p = await read('assignment.delete_preview', {
      course_id: props.courseId,
      assignment_id: props.assignment.id,
    })
    if (mine === generation) preview.value = p
  } catch (e) {
    if (mine !== generation) return
    if (isDeletedError(e)) return goneAlready()
    previewError.value = toApiError(e)
  } finally {
    if (mine === generation) counting.value = false
  }
}

const typed = ref('')
const touched = ref(false)
/** Core refused a deletion confirmed with fewer than there are now: counted again since. */
const stale = ref(false)
/** Core's refusal of the deletion itself, other than a stale count. */
const refused = ref<ApiError | null>(null)

watch(
  open,
  (v) => {
    if (!v) return
    preview.value = null
    typed.value = ''
    touched.value = false
    stale.value = false
    refused.value = null
    void count()
  },
  { immediate: true },
)

const counts = computed(() => preview.value?.counts ?? null)
/** Its title, as Core has it now: the one typed to confirm. */
const title = computed(() => preview.value?.title ?? props.assignment.title)
/**
 * The title as it is drawn, each run of white space one space: a field's
 * placeholder would drop a line break altogether, joining the words either
 * side of it, which are then typed apart (titleMatches).
 */
const shownTitle = computed(() => title.value.replace(/\s+/gu, ' ').trim())

/** The lines of what goes with it, those whose count is not nought, in the reader's words. */
const lines = computed<string[]>(() => {
  const c = counts.value
  if (!c) return []
  // Intl's list is the language's, and Intl is not reactive.
  void locale.value
  return goesLines(c, (key, named, n) => (n === undefined ? t(key, named) : t(key, named, n)))
})

/** Its instructions and rubric, which stay in the course. */
const documentsStay = computed(() => {
  const a = props.assignment
  if (a.instructions_document_id && a.rubric_document_id) return t('assignments.delete.documentsStay.both')
  if (a.instructions_document_id) return t('assignments.delete.documentsStay.instructions')
  if (a.rubric_document_id) return t('assignments.delete.documentsStay.rubric')
  return null
})

/**
 * Whether deleting it works the totals out again (one published that counts
 * in the grade). A total spans every assignment, which a seat listed for
 * some assignments does not reach: Core then refuses the deletion for the
 * assignments (assignment_out_of_scope) whatever the seat's list holds, and
 * that is the only time the preview does, as one the seat does not reach at
 * all is refused before anything is counted (previewError).
 */
const rewritesTotals = computed(() => !preview.value || (preview.value.published && preview.value.in_grade))
/**
 * A refusal for the assignments of a deletion that works out no total: for
 * the assignment itself, taken off the seat's list since it was counted.
 */
const notListed = (reason: unknown) => reason === 'assignment_out_of_scope' && !rewritesTotals.value

/** What Core says it would refuse right now, in words. */
function refusalWords(reason: string): string {
  if (notListed(reason)) return t('assignments.delete.notListed')
  const own = `${REASONS}.${reason}`
  if (te(own)) return t(own)
  const deny = `actions.denyReason.${reason}`
  return te(deny) ? t(deny) : t('assignments.delete.otherRefusal')
}
const previewRefusal = computed(() => {
  const r = preview.value?.refusal
  return r ? refusalWords(r) : null
})
/** Core's refusal of the deletion, unless the count read since says the same. */
const refusedText = computed(() => {
  const e = refused.value
  if (!e) return null
  if (preview.value?.refusal && e.details?.reason === preview.value.refusal) return null
  if (notListed(e.details?.reason)) return t('assignments.delete.notListed')
  return errorMessage(e, { reasons: REASONS })
})

// --- Confirming ----------------------------------------------------------------
const needsTitle = computed(() => hasWork(counts.value))
const titleOk = computed(() => !needsTitle.value || titleMatches(typed.value, title.value))
const mismatch = computed(
  () => needsTitle.value && touched.value && titleAsRead(typed.value) !== '' && !titleOk.value,
)
const needsApproval = computed(() => course.needsApproval('assignment_write'))
const canDelete = computed(
  () => !!preview.value && !counting.value && !preview.value.refusal && course.writable && titleOk.value,
)

function goneAlready() {
  ElMessage({ type: 'info', message: t('assignments.delete.gone') })
  open.value = false
  emit('gone')
}

/** The toast once it is gone: its title, and what went with it. */
function doneText(r: AssignmentDeleteOut): string {
  void locale.value
  const parts = (
    [
      [r.removed.submissions, 'assignments.delete.doneSubmissions'],
      [r.removed.grades, 'assignments.delete.doneGrades'],
      [r.removed.files, 'assignments.delete.doneFiles'],
    ] as [number, string][]
  )
    .filter(([n]) => n > 0)
    .map(([n, key]) => t(key, { n }, n))
  return parts.length
    ? t('assignments.delete.doneWith', { title: r.title, parts: formatList(parts) })
    : t('assignments.delete.done', { title: r.title })
}

async function submit() {
  touched.value = true
  const p = preview.value
  if (!p || !canDelete.value || pending.value) return
  refused.value = null
  const out = await run(
    { course_id: props.courseId, assignment_id: props.assignment.id, confirm: { ...p.counts } },
    { notify: false, reasons: REASONS },
  )
  if (!out) {
    const e = lastError.value
    if (!e) return
    if (isDeletedError(e)) return goneAlready()
    if (e.details?.reason === 'confirm_stale') {
      // More would go now than was shown: show what goes now, and ask again.
      stale.value = true
      typed.value = ''
      touched.value = false
      await count()
      return
    }
    refused.value = e
    stale.value = false
    // What Core answered may have changed what goes, or what it would refuse;
    // with no answer at all, the same deletion is tried again under its key.
    const unanswered = e.isNetwork || e.status >= 500 || e.code === 'rate_limited'
    if (!unanswered) void count()
    return
  }
  if (out.status === 'proposed') {
    announce(out)
    open.value = false
    emit('proposed', out.actionId)
    return
  }
  if (out.replayed) announce(out)
  else {
    ElMessage({ type: 'success', message: doneText(out.result) })
    if (out.reviewState === 'pending') ElMessage({ type: 'info', message: t('common.outcome.pendingReview') })
  }
  open.value = false
  emit('deleted', out.result)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('assignments.delete.title')"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
    class="delete-assignment"
  >
    <el-alert type="warning" :closable="false" show-icon class="delete-assignment__alert">
      <template #title>{{ t('assignments.delete.lead', { title: shownTitle }) }}</template>
    </el-alert>

    <el-alert v-if="stale" type="warning" :closable="false" show-icon class="delete-assignment__alert">
      <template #title>{{ t('assignments.delete.refusal.confirm_stale') }}</template>
    </el-alert>
    <el-alert v-if="refusedText" type="error" :closable="false" show-icon class="delete-assignment__alert">
      <template #title>{{ refusedText }}</template>
    </el-alert>

    <div v-if="counting && !preview" class="delete-assignment__counting" role="status">
      <el-icon class="is-loading" aria-hidden="true"><Loading /></el-icon>
      <span>{{ t('assignments.delete.loading') }}</span>
    </div>
    <el-alert v-else-if="previewError" type="error" :closable="false" show-icon class="delete-assignment__alert">
      <template #title>{{ errorMessage(previewError) }}</template>
      <el-button link type="primary" @click="count">{{ t('common.actions.retry') }}</el-button>
    </el-alert>

    <template v-if="preview">
      <section class="delete-assignment__goes" :aria-busy="counting">
        <h3 class="delete-assignment__heading">{{ t('assignments.delete.goes') }}</h3>
        <ul v-if="lines.length" class="delete-assignment__lines">
          <li v-for="line in lines" :key="line">{{ line }}</li>
        </ul>
        <p v-else-if="nothingGoes(counts)" class="delete-assignment__p">{{ t('assignments.delete.nothing') }}</p>
        <p v-if="documentsStay" class="delete-assignment__p app-form-hint">{{ documentsStay }}</p>
      </section>

      <AppNote v-if="preview.published" class="delete-assignment__note">
        {{ t('assignments.delete.published') }}
      </AppNote>
      <AppNote v-if="needsApproval" class="delete-assignment__note">{{ t('assignments.delete.approval') }}</AppNote>

      <el-alert v-if="previewRefusal" type="warning" :closable="false" show-icon class="delete-assignment__alert">
        <template #title>{{ previewRefusal }}</template>
      </el-alert>

      <el-form
        v-if="needsTitle && !previewRefusal"
        label-position="top"
        :disabled="pending"
        class="delete-assignment__form"
        @submit.prevent="submit"
      >
        <el-form-item
          :label="t('assignments.delete.typeTitle')"
          :error="mismatch ? t('assignments.delete.typeMismatch') : ''"
          for="delete-assignment-title"
        >
          <el-input
            id="delete-assignment-title"
            v-model="typed"
            name="confirm-title"
            autocomplete="off"
            spellcheck="false"
            :placeholder="shownTitle"
            @blur="touched = true"
          />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button :disabled="pending" @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="danger" :loading="pending" :disabled="!canDelete" @click="submit">
        <el-icon aria-hidden="true"><Delete /></el-icon><span>{{ t('assignments.delete.confirm') }}</span>
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.delete-assignment__alert {
  margin-bottom: 12px;
}
.delete-assignment__counting {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-ink-2);
  margin: 4px 0 12px;
}
.delete-assignment__heading {
  margin: 0 0 6px;
  font-size: var(--app-text-md);
  font-weight: var(--app-weight-strong);
}
.delete-assignment__lines {
  margin: 0 0 10px;
  padding-left: 20px;
  line-height: var(--app-lh-text);
}
.delete-assignment__p {
  margin: 0 0 10px;
  line-height: var(--app-lh-text);
}
.delete-assignment__note {
  margin-bottom: 12px;
}
.delete-assignment__form {
  margin-top: 4px;
}
</style>
