<script setup lang="ts">
// A student's own work on one assignment: their attempts (submission.list),
// the open draft — its text (submission.update_draft) and files
// (document.create kind submission, document.archive) — handing it in
// (submission.submit), starting again (submission.create), and the posted
// grade of each attempt (grade.list).
//
// Handing in names what is being handed in: the draft's text and its files,
// and the version of the instructions the student read. Core refuses the
// hand-in if the draft holds anything else by then — an edit from another tab,
// say — or if other instructions have been published since, so nothing is
// handed in that the student did not see.
//
// A change or a hand-in that waits for approval is found again in the
// student's own actions (action.list_mine), so that it is not asked for twice
// and the page keeps saying so, also after a reload.
//
// Files are dropped on the draft's drop zone, or anywhere on the page while
// a draft is open, chosen or pasted; each is attached as soon as it is up.
//
// On group work (groupWork.ts) the work is the student's group's: one draft
// its members write together, each edit naming the revision it was written
// over (base_revision). The draft is read again every 20 seconds while it is
// open, so that what the others wrote shows, with who changed it last; a
// change made while the student has unsaved text is a conflict they settle
// (load the draft as it is now, or keep theirs and save it over it), and
// nothing is handed in that they have not seen. A hand-in names whom it is
// for, and says whom it left out (left_out); a student in no group of the
// set is told so, and where they may sign up, in place of a draft to start.
// Where the draft stops being theirs while it is open — another member hands
// it in, or they are moved out of the group — they are told so, the group is
// read again, and what they had typed and not saved stays on the page, to
// copy, until they discard it.
import { computed, h, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { read, type ApiError, type UploadedFile } from '@/api/http'
import type { Assignment, GradeSummary, Submission, SubmissionSummary } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { errorMessage, notifyError } from '@/composables/useErrors'
import { usePolling } from '@/composables/usePolling'
import { announce, useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { FILE_REFUSAL_SCOPE } from '@/utils/documentFiles'
import { formatDecimal, fromNow } from '@/utils/format'
import { copyText } from '@/utils/clipboard'
import { zonedText } from '@/utils/parts'
import AppNote from '@/components/AppNote.vue'
import AsyncState from '@/components/AsyncState.vue'
import DocumentFiles from '@/components/DocumentFiles.vue'
import FileDropZone from '@/components/FileDropZone.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import {
  emptyDraft,
  groupIn,
  groupSetRoute,
  handedInFor,
  isGroupAssignment,
  keepMine,
  leftOutMembers,
  loadTheirs,
  notInDraftsGroup,
  partOfOtherWork,
  readDraft,
  refusedAsChanged,
  savedDraft,
  type GroupSet,
  type SharedDraft,
} from './groupWork'
import { allGrades, allSubmissions, myActionsSince } from './useAssignmentData'
import { useWorkNames } from './useWorkNames'

const props = defineProps<{
  courseId: string
  assignment: Assignment
  /** The version of the instructions students read now, when there are instructions and it is known. */
  instructionsVersionId?: string | null
  /** On group work, its group set as read (its name, sign-up, and the student's own group's members). */
  groupSet?: GroupSet | null
}>()
const emit = defineEmits<{
  /** Other instructions are in force than the ones on the page: read them again. */
  instructionsChanged: []
  /** The student's group is not what the page thought: read the assignment (my_group) and its set again. */
  groupChanged: []
}>()
const { t } = useI18n()
const course = useCourseStore()
const router = useRouter()
const { nameIn, namesOf } = useWorkNames()

const me = computed(() => course.myMemberId)

// --- Group work ---------------------------------------------------------------------
/** The work is a group's: one draft its members write together. */
const shared = computed(() => isGroupAssignment(props.assignment))
const myGroup = computed(() => (shared.value ? (props.assignment.my_group ?? null) : null))
/** Group work, and the student is in no group of its set: nothing to start. */
const noGroup = computed(() => shared.value && !myGroup.value)
const signup = computed(() => props.groupSet?.signup ?? null)
/** The set's page, where its sign-up is. */
const setPage = computed(() =>
  props.assignment.group_set_id ? groupSetRoute(router, props.courseId, props.assignment.group_set_id) : null,
)
const canWrite = computed(
  () => course.writable && course.membership?.status !== 'paused' && course.can('submission_write'),
)
const needsApproval = computed(() => course.needsApproval('submission_write'))

// --- Attempts and grades --------------------------------------------------------
const attempts = useAsync<SubmissionSummary[]>(
  async () => {
    if (!me.value) return []
    const subs = await allSubmissions(props.courseId, {
      assignment_id: props.assignment.id,
      student_member_id: me.value,
    })
    return subs.sort((a, b) => b.attempt - a.attempt)
  },
  { watch: [() => props.assignment.id], keepData: true },
)
const grades = useAsync<GradeSummary[]>(
  async () => {
    if (!me.value || !course.can('grade_read')) return []
    try {
      return await allGrades(props.courseId, { assignment_id: props.assignment.id, student_member_id: me.value })
    } catch {
      return []
    }
  },
  { watch: [() => props.assignment.id], keepData: true },
)
const list = computed(() => attempts.data.value ?? [])
const latest = computed(() => list.value[0] ?? null)
const draft = computed(() => list.value.find((s) => s.state === 'draft') ?? null)
function gradeFor(submissionId: string): GradeSummary | undefined {
  return (grades.data.value ?? []).find((g) => g.submission_id === submissionId && g.state === 'posted')
}

// --- The open draft ---------------------------------------------------------------
const draftFull = useAsync<Submission | null>(
  async () =>
    draft.value ? read('submission.get', { course_id: props.courseId, submission_id: draft.value.id }) : null,
  { watch: [() => draft.value?.id], keepData: true },
)
const current = computed(() => {
  const d = draftFull.data.value
  return d && draft.value && d.id === draft.value.id ? d : null
})
const files = computed(() => current.value?.files ?? [])

/** What the person is writing, and what Core holds (as far as their writing goes: see SharedDraft). */
const text = ref('')
const serverBody = ref('')
/** The revision of serverBody, which an edit of a group's draft names; and a change by someone else to settle. */
const baseRevision = ref<number | null>(null)
const conflict = ref<SharedDraft['conflict']>(null)
function draftState(): SharedDraft {
  return { text: text.value, serverBody: serverBody.value, baseRevision: baseRevision.value, conflict: conflict.value }
}
function setDraftState(s: SharedDraft) {
  text.value = s.text
  serverBody.value = s.serverBody
  baseRevision.value = s.baseRevision
  conflict.value = s.conflict
}
/** The text of the newest change to the draft that waits for approval, and whether a hand-in of it does. */
const proposedBody = ref<string | null>(null)
const handInProposed = ref(false)
let syncedId: string | null = null
/** The draft this page has just handed in: its reading as handed in is no news. */
let handedInHere: string | null = null
/** The draft Core has said is not the student's group's now: said once. */
let notMineId: string | null = null
watch(
  () => draftFull.data.value,
  (d) => {
    if (!d) {
      syncedId = null
      setDraftState(emptyDraft())
      return
    }
    if (d.state !== 'draft') {
      handedInElsewhere(d)
      return
    }
    // Read as one of its group again (moved back, say): its refusal can be said again.
    if (d.id === notMineId) notMineId = null
    const body = d.body ?? ''
    // A reload (after a file was attached, say) must not throw away what is
    // being typed; a different draft starts from its own text. A group's
    // draft changed by someone else under unsaved text is a conflict.
    setDraftState(
      readDraft(
        draftState(),
        { revision: d.revision, body, revisedAt: d.revised_at, revisedBy: d.revised_by_member_id },
        { fresh: d.id !== syncedId, shared: shared.value },
      ),
    )
    syncedId = d.id
    // The change that waited for approval is in: it was approved.
    if (proposedBody.value !== null && body === proposedBody.value) proposedBody.value = null
  },
)
const dirty = computed(() => !!current.value && text.value !== serverBody.value)

/**
 * Someone in the group handed the draft in (read again, it is not a draft):
 * say who, and whether the person's unsaved text went without them, and
 * show the attempts as they are now.
 */
function handedInElsewhere(d: Submission) {
  if (shared.value && syncedId === d.id && handedInHere !== d.id) {
    const name = nameIn(d.submitted_by_member_id, d.members, { start: true })
    if (keepUnsaved()) warning.value = t('groupWork.work.handedInByOtherUnsaved', { name })
    else news.value = t('groupWork.work.handedInByOther', { name })
  }
  syncedId = null
  void attempts.reload()
  void grades.reload()
}

/**
 * What the person typed into a group's draft and did not save, where the
 * draft is no longer theirs to save it to (handed in by someone else, or
 * their group's no more): kept on the page, to copy, until they discard it.
 */
const keptText = ref<string | null>(null)
/** Keeps what is typed and not saved, if anything is; whether it did. */
function keepUnsaved(): boolean {
  if (text.value === serverBody.value || !text.value.trim()) return false
  keptText.value = text.value
  return true
}
const keptCopied = ref(false)
let keptCopiedTimer: ReturnType<typeof setTimeout> | undefined
async function copyKept() {
  if (keptText.value === null) return
  if (!(await copyText(keptText.value))) {
    ElMessage({ type: 'warning', message: t('groupWork.work.keptCopyFailed'), showClose: true })
    return
  }
  keptCopied.value = true
  clearTimeout(keptCopiedTimer)
  keptCopiedTimer = setTimeout(() => (keptCopied.value = false), 1600)
}
async function discardKept() {
  try {
    await ElMessageBox.confirm(t('groupWork.work.keptDiscardBody'), t('groupWork.work.keptDiscardTitle'), {
      type: 'warning',
      confirmButtonText: t('groupWork.work.keptDiscard'),
      cancelButtonText: t('common.actions.cancel'),
    })
  } catch {
    return
  }
  keptText.value = null
}

/**
 * The student is not one of the draft's group now (Core refused reading or
 * writing it so): moved to another group, or out of the set. Said, with
 * what they had not saved kept; their group, and their work, read again.
 * Once a draft: the 20-second read and a save may both find it.
 */
function draftNotMine(id: string) {
  if (notMineId === id) return
  notMineId = id
  keepUnsaved()
  const group = current.value?.id === id ? current.value.group_name : null
  warning.value = group ? t('groupWork.work.notInGroupNow', { group }) : t('groupWork.work.notInGroupNowUnnamed')
  news.value = null
  emit('groupChanged')
  void attempts.reload()
  void grades.reload()
}

// A group's draft, read again now and then while it is open, so that what the
// others wrote shows. Read beside the page's own reading, so that a read that
// fails leaves the draft on the page as it was.
usePolling(
  async () => {
    const d = draft.value
    if (!d) return
    let fresh: Submission
    try {
      fresh = await read('submission.get', { course_id: props.courseId, submission_id: d.id })
    } catch (e) {
      if (draft.value?.id === d.id && notInDraftsGroup(e)) return draftNotMine(d.id)
      throw e
    }
    if (draft.value?.id === d.id && !busy.value) draftFull.data.value = fresh
  },
  { intervalMs: 20_000, immediate: false, enabled: () => shared.value && !!draft.value && canWrite.value },
)

/** Who changed the group's draft last, and when. */
const revisedBy = computed(() =>
  current.value?.revised_at ? nameIn(current.value.revised_by_member_id, current.value.members) : null,
)
const conflictBy = computed(() =>
  conflict.value ? nameIn(conflict.value.revisedBy, current.value?.members, { start: true }) : '',
)
const showTheirs = ref(false)
watch(conflict, (c) => {
  if (!c) showTheirs.value = false
})
function onLoadTheirs() {
  setDraftState(loadTheirs(draftState()))
}
function onKeepMine() {
  setDraftState(keepMine(draftState()))
}

/** The members of the student's group now: the draft's while one is open, else the set's. */
const groupMembers = computed(() => {
  if (!shared.value) return []
  if (current.value?.members?.length) return current.value.members
  return groupIn(props.groupSet, myGroup.value?.group_id)?.members ?? []
})
/** The student is part of another group's work for the assignment: their group's hand-in leaves them out. */
const otherWork = computed(() => partOfOtherWork(list.value, myGroup.value?.group_id, me.value))
const nothingToHandIn = computed(() => !text.value.trim() && !files.value.length)

const pastDue = computed(() => !!props.assignment.due_at && dayjs(props.assignment.due_at).isBefore(dayjs()))

/** Something that waits for approval, said until the person moves on. */
const notice = ref<string | null>(null)
/** What someone else in the group did to the draft, said until the person moves on. */
const news = ref<string | null>(null)
/** Something to do before handing in, said until the person moves on. */
const warning = ref<string | null>(null)

// --- What waits for approval --------------------------------------------------------
// proposedBody and handInProposed (above) are set at once when a write
// becomes a proposal, and read back from the student's own actions whenever
// the draft is loaded.
const waiting = useAsync<{ body: string | null; handIn: boolean } | null>(
  async () => {
    const d = draft.value
    if (!d) return { body: null, handIn: false }
    try {
      const acts = await myActionsSince(props.courseId, d.id)
      let body: string | null = null
      let handIn = false
      for (const a of acts) {
        if (a.status !== 'proposed' || a.target_id !== d.id) continue
        if (a.action_type === 'submission.update_draft') {
          const p = a.payload as { body?: unknown } | null
          body = typeof p?.body === 'string' ? p.body : ''
        } else if (a.action_type === 'submission.submit') {
          handIn = true
        }
      }
      return { body, handIn }
    } catch {
      // Not knowing only means the page says less.
      return null
    }
  },
  { watch: [() => draft.value?.id], keepData: true },
)
watch(
  () => draft.value?.id,
  () => {
    proposedBody.value = null
    handInProposed.value = false
  },
)
watch(
  () => waiting.data.value,
  (w) => {
    if (!w) return
    proposedBody.value = w.body !== null && w.body !== serverBody.value ? w.body : null
    handInProposed.value = w.handIn
  },
)
/** What is typed is what waits for approval. */
const typedIsProposed = computed(() => proposedBody.value !== null && text.value === proposedBody.value)

// --- Starting -----------------------------------------------------------------------
const createW = useWrite('submission.create')
async function start() {
  notice.value = null
  news.value = null
  warning.value = null
  const out = await createW.run(
    { course_id: props.courseId, assignment_id: props.assignment.id },
    { success: t('assignments.work.started'), notify: false },
  )
  if (out) announce(out, { success: t('assignments.work.started') })
  if (out?.status === 'proposed') notice.value = t('assignments.work.startProposed')
  const err = createW.lastError.value
  if (!out && err) {
    if (shared.value && err.code === 'conflict' && typeof err.details?.submission_id === 'string') {
      // Someone in the group started it meanwhile: there is one to show.
      ElMessage({ type: 'info', message: t('groupWork.work.alreadyStarted') })
    } else {
      notifyError(err, undefined, { reasons: 'groupWork.refusal' })
      // In no group after all, or in another: the page reads the group again.
      if (err.details?.reason === 'no_group') emit('groupChanged')
    }
  }
  // Reloaded whatever came of it: a refusal because a draft is already open
  // means there is one to show.
  await attempts.reload()
}
/** Group work whose latest attempt the student is part of is another group's: their group's next is not numbered from it. */
const latestElsewhere = computed(
  () => shared.value && !!latest.value?.group_id && latest.value.group_id !== myGroup.value?.group_id,
)
const startLabel = computed(() => {
  const l = latest.value
  if (!l || latestElsewhere.value) return shared.value ? t('groupWork.work.start') : t('assignments.work.start')
  if (l.state === 'missing') return t('assignments.work.startLate')
  return t('assignments.work.startNext', { n: l.attempt + 1 })
})

// --- Saving the text ----------------------------------------------------------------
/**
 * A group's draft whose edit Core refused, read again: handed in by someone
 * else meanwhile, it is shown as such (handedInElsewhere, which keeps what
 * was typed), and true; anything else is the refusal's to say.
 */
async function handedInMeanwhile(id: string, err: ApiError): Promise<boolean> {
  if (err.isNetwork || err.status >= 500) return false
  try {
    const fresh = await read('submission.get', { course_id: props.courseId, submission_id: id })
    if (fresh.state === 'draft' || draft.value?.id !== id) return false
    draftFull.data.value = fresh
    return true
  } catch {
    return false
  }
}
const saveW = useWrite('submission.update_draft')
async function save(): Promise<boolean> {
  const d = draft.value
  if (!d || typedIsProposed.value || conflict.value) return false
  const body = text.value
  // A group's draft: the revision this text was written over, which Core
  // holds it to (draft_changed).
  const base = shared.value && baseRevision.value !== null ? baseRevision.value : undefined
  const out = await saveW.run(
    { course_id: props.courseId, submission_id: d.id, body, base_revision: base },
    { success: t('assignments.work.saved'), notify: !shared.value },
  )
  if (!out) {
    const err = saveW.lastError.value
    if (shared.value && err?.details?.reason === 'draft_changed') {
      // Said by the conflict's own alert, with what to do; read what it is now.
      setDraftState(refusedAsChanged(draftState(), err.details))
      void draftFull.reload()
    } else if (shared.value && notInDraftsGroup(err)) {
      draftNotMine(d.id)
    } else if (shared.value && err && !(await handedInMeanwhile(d.id, err))) {
      notifyError(err, undefined, { reasons: 'groupWork.refusal' })
    }
    return false
  }
  if (shared.value) announce(out, { success: t('assignments.work.saved') })
  if (out.status === 'proposed') {
    // Said by the waiting alert from now on; asking again would only file
    // the same proposal twice.
    proposedBody.value = body
    void waiting.reload()
    return false
  }
  setDraftState(savedDraft(draftState(), body, out.result.revision ?? null))
  void draftFull.reload()
  return true
}

// --- Files ------------------------------------------------------------------------------
const uploads = ref<UploadedFile[]>([])
/** A picked file is still uploading. */
const uploadingFiles = ref(false)
const attachW = useWrite('document.create')
const attaching = ref(false)
watch(uploads, () => void attachAll())
/** Files picked that are not on the draft yet: uploading, being attached, or to attach again. */
const filesPending = computed(() => uploadingFiles.value || attaching.value || uploads.value.length > 0)

/** Attaches each uploaded file to the draft, in turn. One that fails stays listed, to try again or drop. */
async function attachAll() {
  const d = draft.value
  if (attaching.value || !d || !uploads.value.length) return
  attaching.value = true
  let changed = false
  try {
    while (uploads.value.length) {
      const f = uploads.value[0]!
      const out = await attachW.run(
        {
          course_id: props.courseId,
          kind: 'submission',
          submission_id: d.id,
          title: f.fileName,
          // A submitted document of one file, named as it was uploaded.
          files: [{ upload_token: f.uploadToken, filename: f.fileName }],
        },
        { success: t('assignments.work.fileAttached', { name: f.fileName }), reasons: FILE_REFUSAL_SCOPE },
      )
      if (!out) break
      uploads.value = uploads.value.filter((x) => x.uploadToken !== f.uploadToken)
      if (out.status === 'proposed') notice.value = t('assignments.work.fileProposed', { name: f.fileName })
      changed = true
    }
  } finally {
    attaching.value = false
    if (changed) void draftFull.reload()
  }
}

const archiveW = useWrite('document.archive')
async function removeFile(f: { document_id: string; title: string }) {
  try {
    await ElMessageBox.confirm(t('assignments.work.removeFileConfirm', { name: f.title }), t('common.confirm.title'), {
      type: 'warning',
      confirmButtonText: t('common.actions.remove'),
      cancelButtonText: t('common.actions.cancel'),
    })
  } catch {
    return
  }
  const out = await archiveW.run(
    { course_id: props.courseId, document_id: f.document_id },
    { success: t('assignments.work.fileRemoved') },
  )
  if (out?.status === 'proposed') notice.value = t('assignments.work.removeProposed', { name: f.title })
  if (out) void draftFull.reload()
}

// --- Handing in ---------------------------------------------------------------------------
const submitW = useWrite('submission.submit')
const busy = computed(
  () =>
    createW.pending.value || saveW.pending.value || submitW.pending.value || archiveW.pending.value || attaching.value,
)
/** Why Hand in cannot be pressed now, or null. */
const handInBlocked = computed<string | null>(() => {
  if (conflict.value) return t('groupWork.work.resolveFirst')
  if (handInProposed.value) return t('assignments.work.handInWaiting')
  if (proposedBody.value !== null) return t('assignments.work.changeWaiting')
  if (filesPending.value) return t('assignments.work.waitForFiles')
  if (nothingToHandIn.value) return t('assignments.work.nothingToHandIn')
  return null
})

/**
 * Whether the instructions students read now are the ones this page shows.
 * Unknown counts as yes: Core checks it anyway.
 */
async function instructionsStillCurrent(): Promise<boolean> {
  const docId = props.assignment.instructions_document_id
  if (!docId || !props.instructionsVersionId) return true
  try {
    const d = await read('document.get', { course_id: props.courseId, document_id: docId })
    return (d.published_version_id ?? null) === props.instructionsVersionId
  } catch {
    return true
  }
}
function instructionsChanged() {
  warning.value = t('assignments.work.instructionsChanged')
  emit('instructionsChanged')
}
/** Core's refusal of a hand-in under instructions that are no longer in force. */
function isStaleInstructions(e: ApiError | null): boolean {
  return !!e && e.code === 'failed_precondition' && e.message.includes('instructions')
}

/**
 * A group's draft, read again just before it is handed in: what the person
 * hands in must be what they have seen, and for whom it is handed in is the
 * group's members now. Null where it cannot be read (Core checks anyway);
 * false where it has changed, which the page now shows.
 */
async function freshGroupDraft(id: string): Promise<Submission | null | false> {
  let fresh: Submission
  try {
    fresh = await read('submission.get', { course_id: props.courseId, submission_id: id })
  } catch (e) {
    if (!notInDraftsGroup(e)) return null
    draftNotMine(id)
    return false
  }
  const changed = fresh.state !== 'draft' || fresh.revision !== baseRevision.value
  draftFull.data.value = fresh
  if (changed && fresh.state === 'draft') changedBeforeHandIn(fresh)
  return changed ? false : fresh
}
function changedBeforeHandIn(d: Pick<Submission, 'revised_by_member_id' | 'revised_at' | 'members'>) {
  warning.value = t('groupWork.work.changedBeforeHandIn', {
    name: nameIn(d.revised_by_member_id, d.members),
    when: fromNow(d.revised_at),
  })
}

/** The words of the hand-in's confirmation, a paragraph each. */
function handInLines(members: Submission['members']): string[] {
  if (!shared.value) {
    const lines = [t('assignments.work.handInConfirm')]
    if (pastDue.value) lines.push(t('assignments.work.handInLate'))
    if (needsApproval.value) lines.push(t('assignments.work.handInApproval'))
    return [lines.join(' ')]
  }
  const lines = [t('groupWork.work.handInFor', { names: namesOf(members) })]
  const other = otherWork.value
  if (other) lines.push(t('groupWork.work.handInLeftOutMe', { group: other.group_name ?? '' }))
  lines.push(t('groupWork.work.handInFixed'))
  if (pastDue.value) lines.push(t('assignments.work.handInLate'))
  if (needsApproval.value) lines.push(t('assignments.work.handInApproval'))
  return lines
}

async function handIn() {
  const d = draft.value
  if (!d || !current.value || handInBlocked.value) return
  notice.value = null
  news.value = null
  warning.value = null
  leftOutNote.value = null
  if (dirty.value && !(await save())) return
  if (!(await instructionsStillCurrent())) {
    instructionsChanged()
    return
  }
  let members = current.value.members ?? []
  if (shared.value) {
    const fresh = await freshGroupDraft(d.id)
    if (fresh === false) return
    if (fresh) members = fresh.members ?? []
  }
  const lines = handInLines(members)
  const title = shared.value
    ? t('groupWork.work.handInTitle', { n: d.attempt, group: current.value.group_name ?? myGroup.value?.name ?? '' })
    : t('assignments.work.handInConfirmTitle', { n: d.attempt })
  try {
    // One paragraph a sentence: joined with spaces, Chinese would get a stray one after each 。.
    const message =
      lines.length > 1
        ? h(
            'div',
            lines.map((l) => h('p', { style: 'margin: 0 0 8px; line-height: 1.55' }, l)),
          )
        : lines[0]!
    await ElMessageBox.confirm(message, title, {
      type: pastDue.value ? 'warning' : 'info',
      confirmButtonText: t('assignments.work.handIn'),
      cancelButtonText: t('common.actions.cancel'),
    })
  } catch {
    return
  }
  const revisionBefore = baseRevision.value
  const out = await submitW.run(
    {
      course_id: props.courseId,
      submission_id: d.id,
      // What is being handed in, as the person sees it: Core refuses if the
      // draft holds anything else.
      body: serverBody.value,
      files: files.value.map((f) => f.document_id),
      instructions_version_id: props.instructionsVersionId ?? undefined,
      // And for whom: Core refuses if the group's members are others by then.
      members: shared.value ? members.map((m) => m.member_id) : undefined,
    },
    { success: false, notify: false },
  )
  if (!out) {
    const err = submitW.lastError.value
    // Not one of its group any more: there is no draft of theirs to read again.
    if (shared.value && notInDraftsGroup(err)) return draftNotMine(d.id)
    await draftFull.reload()
    const now = draftFull.data.value
    // Published between the check above and the hand-in.
    if (isStaleInstructions(err)) instructionsChanged()
    else if (shared.value && err?.details?.reason === 'members_changed')
      warning.value = errorMessage(err, { reasons: 'groupWork.refusal' })
    // Someone in the group changed the draft in the meantime.
    else if (shared.value && now?.state === 'draft' && now.revision !== revisionBefore) changedBeforeHandIn(now)
    else if (!(shared.value && now && now.state !== 'draft'))
      notifyError(err, undefined, { reasons: 'groupWork.refusal' })
    return
  }
  if (out.status === 'executed') {
    handedInHere = d.id
    const late = out.result.state === 'late'
    const names = shared.value ? namesOf(handedInFor(out.result, members)) : ''
    const msg = shared.value
      ? t(late ? 'groupWork.work.handedInForLate' : 'groupWork.work.handedInFor', { names })
      : late
        ? t('assignments.work.handedInLate')
        : t('assignments.work.handedIn')
    ElMessage({
      type: late ? 'warning' : 'success',
      message: out.reviewState === 'pending' ? `${msg} ${t('common.outcome.pendingReview')}` : msg,
    })
    if (shared.value) noteLeftOut(out.result, members)
  } else {
    // Said by the waiting alert from now on.
    handInProposed.value = true
    void waiting.reload()
  }
  await attempts.reload()
  void grades.reload()
}

/** Whom a group's hand-in left out, said until the person moves on: themselves apart, as "you". */
const leftOutNote = ref<string[] | null>(null)
function noteLeftOut(result: Parameters<typeof leftOutMembers>[0], members: Submission['members']) {
  const out = leftOutMembers(result, members)
  const lines: string[] = []
  if (out.some((m) => m.member_id === me.value)) lines.push(t('groupWork.work.leftOutMe'))
  const others = out.filter((m) => m.member_id !== me.value)
  if (others.length) lines.push(t('groupWork.work.leftOut', { names: namesOf(others) }, others.length))
  leftOutNote.value = lines.length ? lines : null
}

function reload() {
  void attempts.reload()
  void grades.reload()
  void draftFull.reload()
  void waiting.reload()
}
defineExpose({ reload })
</script>

<template>
  <section class="app-card my-work">
    <h2 class="app-card__title">
      <span>{{ t('assignments.work.title') }}</span>
      <StatusTag v-if="needsApproval" vocab="level" value="confirm_required" size="small" />
    </h2>

    <!-- Group work: whose work it is -->
    <dl v-if="shared && myGroup" class="my-work__group">
      <div>
        <dt>{{ t('groupWork.work.group') }}</dt>
        <dd>{{ myGroup.name }}</dd>
      </div>
      <div v-if="groupMembers.length">
        <dt>{{ t('groupWork.work.members') }}</dt>
        <dd>{{ namesOf(groupMembers) }}</dd>
      </div>
    </dl>

    <el-alert v-if="warning" type="warning" show-icon class="my-work__alert" :title="warning" @close="warning = null" />
    <el-alert
      v-if="leftOutNote"
      type="warning"
      show-icon
      class="my-work__alert my-work__left-out"
      @close="leftOutNote = null"
    >
      <p v-for="line in leftOutNote" :key="line">{{ line }}</p>
    </el-alert>
    <AppNote v-if="notice" class="my-work__alert" @close="notice = null" closable>
      {{ notice }}
      <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
        t('assignments.list.viewMyActions')
      }}</router-link>
    </AppNote>

    <AppNote v-if="news" class="my-work__alert" closable @close="news = null">{{ news }}</AppNote>

    <!-- What was typed into the group's draft and not saved, where the draft is no longer theirs: to copy -->
    <section v-if="keptText !== null" class="my-work__kept" aria-labelledby="my-work-kept-title">
      <h3 id="my-work-kept-title" class="my-work__kept-title">{{ t('groupWork.work.keptTitle') }}</h3>
      <p class="my-work__kept-hint">{{ t('groupWork.work.keptHint') }}</p>
      <pre class="my-work__kept-text" tabindex="0">{{ keptText }}</pre>
      <div class="my-work__kept-actions">
        <el-button size="small" type="primary" @click="copyKept">
          <el-icon><component :is="keptCopied ? 'Check' : 'DocumentCopy'" /></el-icon>
          <span>{{ keptCopied ? t('common.actions.copied') : t('common.actions.copy') }}</span>
        </el-button>
        <el-button size="small" @click="discardKept">{{ t('groupWork.work.keptDiscard') }}</el-button>
      </div>
    </section>

    <AsyncState
      :loading="attempts.loading.value && !attempts.data.value"
      :error="attempts.error.value"
      @retry="attempts.reload"
    >
      <!-- The open draft -->
      <div v-if="draft" class="my-work__draft">
        <div class="my-work__draft-head">
          <strong>{{ t('assignments.work.draftTitle', { n: draft.attempt }) }}</strong>
          <StatusTag vocab="submissionState" value="draft" />
          <span class="app-muted my-work__started">
            {{ t('assignments.work.startedAt') }} <TimeText :value="draft.created_at" relative />
          </span>
        </div>
        <el-alert v-if="pastDue" type="warning" :closable="false" show-icon class="my-work__alert">
          {{ t('assignments.work.pastDue') }}
        </el-alert>
        <AppNote v-if="handInProposed || proposedBody !== null" class="my-work__alert">
          {{ handInProposed ? t('assignments.work.handInProposed') : t('assignments.work.savePending') }}
          <router-link :to="{ name: 'course-my-actions', params: { courseId } }">
            {{ t('assignments.list.viewMyActions') }}
          </router-link>
        </AppNote>

        <AsyncState
          :loading="draftFull.loading.value && !current"
          :error="draftFull.error.value"
          @retry="draftFull.reload"
        >
          <!-- A change to the group's draft by someone else, under unsaved text: theirs, or keep mine. -->
          <el-alert v-if="conflict" type="warning" :closable="false" show-icon class="my-work__alert my-work__conflict">
            <template #title>
              <i18n-t keypath="groupWork.work.conflictTitle" tag="span" scope="global">
                <template #name>{{ conflictBy }}</template>
                <template #when><TimeText :value="conflict.revisedAt" relative /></template>
              </i18n-t>
            </template>
            <p class="my-work__conflict-body">{{ t('groupWork.work.conflictBody') }}</p>
            <template v-if="conflict.body !== null">
              <el-button link type="primary" :aria-expanded="showTheirs" @click="showTheirs = !showTheirs">
                <el-icon><component :is="showTheirs ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
                <span>{{ t('groupWork.work.showTheirs') }}</span>
              </el-button>
              <div v-if="showTheirs" class="my-work__theirs">
                <MarkdownView :source="conflict.body" :empty="t('submissions.detail.draftBody')" />
              </div>
            </template>
            <p v-else class="my-work__conflict-body">{{ t('groupWork.work.conflictLoading') }}</p>
            <div class="my-work__conflict-actions">
              <el-button size="small" :disabled="conflict.body === null" @click="onLoadTheirs">
                {{ t('groupWork.work.loadTheirs') }}
              </el-button>
              <el-button size="small" type="primary" :disabled="conflict.body === null" @click="onKeepMine">
                {{ t('groupWork.work.keepMine') }}
              </el-button>
            </div>
          </el-alert>

          <div class="my-work__label my-work__label--text">
            <span>{{ shared ? t('groupWork.work.text') : t('assignments.work.text') }}</span>
            <i18n-t
              v-if="shared && revisedBy && current?.revised_at"
              keypath="groupWork.work.revised"
              tag="span"
              scope="global"
              class="app-muted my-work__revised"
            >
              <template #name>{{ revisedBy }}</template>
              <template #when><TimeText :value="current.revised_at" relative /></template>
            </i18n-t>
          </div>
          <MarkdownEditor
            v-model="text"
            :rows="10"
            :disabled="!canWrite || busy"
            :placeholder="t('assignments.work.placeholder')"
          />

          <div class="my-work__label my-work__label--files">{{ t('assignments.work.files') }}</div>
          <ul v-if="files.length" class="my-work__files">
            <li v-for="f in files" :key="f.document_id">
              <DocumentFiles :course-id="courseId" :document-id="f.document_id" :title="f.title" />
              <el-button
                link
                type="danger"
                :disabled="!canWrite || busy"
                :aria-label="t('common.actions.remove')"
                @click="removeFile(f)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </li>
          </ul>
          <p v-else class="app-muted my-work__nofiles">{{ t('assignments.work.noFiles') }}</p>
          <FileDropZone
            v-model="uploads"
            v-model:uploading="uploadingFiles"
            :course-id="courseId"
            kind="submission"
            multiple
            page-drop
            :disabled="!canWrite || attaching"
            :label="t('assignments.work.dropLabel')"
          />
          <div class="app-form-hint">
            {{ t('assignments.work.attachHint') }}
            <el-button v-if="uploads.length && !attaching" link type="primary" @click="attachAll">
              {{ t('assignments.work.retryAttach') }}
            </el-button>
          </div>

          <div class="my-work__actions">
            <span class="my-work__saved app-muted">
              <template v-if="dirty && typedIsProposed">
                <el-icon><Clock /></el-icon>{{ t('assignments.work.awaitingApproval') }}
              </template>
              <template v-else-if="dirty">
                <el-icon><EditPen /></el-icon>{{ t('assignments.work.unsaved') }}
              </template>
              <template v-else>
                <el-icon><Check /></el-icon>{{ t('assignments.work.allSaved') }}
              </template>
            </span>
            <span class="app-toolbar__spacer" />
            <el-button
              :disabled="!canWrite || !dirty || typedIsProposed || busy || !!conflict"
              :loading="saveW.pending.value"
              @click="save"
            >
              {{ t('assignments.work.save') }}
            </el-button>
            <el-tooltip :content="handInBlocked ?? ''" :disabled="!handInBlocked || !canWrite" placement="top">
              <span>
                <el-button
                  type="primary"
                  :disabled="!canWrite || !!handInBlocked || busy"
                  :loading="submitW.pending.value"
                  @click="handIn"
                >
                  <el-icon><Promotion /></el-icon>
                  <span>{{ t('assignments.work.handIn') }}</span>
                </el-button>
              </span>
            </el-tooltip>
          </div>
        </AsyncState>
      </div>

      <!-- Group work, and in no group of its set: nothing to start; where to join one -->
      <AppNote v-else-if="noGroup" :title="t('groupWork.work.noGroupTitle')" class="my-work__no-group">
        <p>
          {{
            groupSet ? t('groupWork.work.noGroupBody', { set: groupSet.name }) : t('groupWork.work.noGroupBodyNoSet')
          }}
        </p>
        <template v-if="signup?.joinable">
          <p>
            {{
              signup.closes_at
                ? t('groupWork.work.signupUntil', { closes: zonedText(signup.closes_at) })
                : t('groupWork.work.signupOpen')
            }}
            <template v-if="!setPage">{{ t('groupWork.work.signupWhere') }}</template>
          </p>
          <router-link v-if="setPage" :to="setPage" class="my-work__join">
            <el-button type="primary">{{ t('groupWork.work.chooseGroup') }}</el-button>
          </router-link>
        </template>
        <p v-else-if="groupSet">{{ t('groupWork.work.askTeacher') }}</p>
        <p v-if="list.some((s) => s.state !== 'draft')">{{ t('groupWork.work.noGroupNow') }}</p>
      </AppNote>

      <!-- Nothing open: start (again) -->
      <div v-else class="my-work__start">
        <AppNote v-if="otherWork" class="my-work__alert">
          {{ t('groupWork.work.notPartNow', { group: otherWork.group_name ?? '' }) }}
        </AppNote>
        <p v-if="!latestElsewhere" class="my-work__start-text">
          <template v-if="!latest">{{ t('assignments.work.none') }}</template>
          <template v-else-if="latest.state === 'missing'">{{ t('assignments.work.missingHint') }}</template>
          <template v-else>{{ t('assignments.work.startNextHint') }}</template>
        </p>
        <el-alert
          v-if="pastDue && (!latest || latest.state === 'missing')"
          type="warning"
          :closable="false"
          show-icon
          class="my-work__alert"
        >
          {{ t('assignments.work.pastDue') }}
        </el-alert>
        <div class="my-work__start-actions">
          <el-button
            :type="latest ? 'default' : 'primary'"
            :disabled="!canWrite || busy"
            :loading="createW.pending.value"
            @click="start"
          >
            <el-icon><EditPen /></el-icon>
            <span>{{ startLabel }}</span>
          </el-button>
          <span v-if="!latest" class="app-form-hint">{{
            shared ? t('groupWork.work.startHint') : t('assignments.work.startHint')
          }}</span>
        </div>
      </div>

      <!-- Every attempt -->
      <template v-if="list.some((s) => s.state !== 'draft')">
        <h3 class="my-work__subtitle">{{ t('assignments.work.attempts') }}</h3>
        <ul class="my-work__attempts">
          <li v-for="s in list" :key="s.id" class="my-work__attempt">
            <div class="my-work__attempt-main">
              <strong>{{ t('assignments.work.attempt', { n: s.attempt }) }}</strong>
              <StatusTag vocab="submissionState" :value="s.state" />
              <span v-if="s.submitted_at" class="app-muted">
                {{ t('assignments.work.handedInAt') }} <TimeText :value="s.submitted_at" />
              </span>
              <span v-else-if="s.state === 'draft'" class="app-muted">{{ t('assignments.work.beingEdited') }}</span>
            </div>
            <div class="my-work__attempt-side">
              <template v-if="gradeFor(s.id)">
                <router-link
                  :to="{ name: 'course-grade', params: { courseId, gradeId: gradeFor(s.id)!.id } }"
                  class="my-work__grade"
                >
                  <el-icon><Medal /></el-icon>
                  {{ formatDecimal(gradeFor(s.id)!.score) }} / {{ formatDecimal(assignment.points_possible) }}
                </router-link>
              </template>
              <span v-else-if="s.state !== 'draft'" class="app-muted">{{ t('assignments.work.noGrade') }}</span>
              <router-link
                v-if="s.state !== 'draft'"
                :to="{ name: 'course-submission', params: { courseId, submissionId: s.id } }"
              >
                {{ t('assignments.work.viewSubmission') }}
              </router-link>
            </div>
            <!-- A group's attempt: its group, whom it is for (as handed in), and who handed it in. -->
            <div v-if="s.group_id" class="my-work__attempt-who">
              <span v-if="s.group_name">{{ s.group_name }}</span>
              <span v-if="s.state !== 'draft' && s.members?.length">{{
                t(s.state === 'missing' ? 'groupWork.work.recordedFor' : 'groupWork.work.forMembers', {
                  names: namesOf(s.members),
                })
              }}</span>
              <span v-if="s.submitted_by_member_id">{{
                t('groupWork.work.handedInBy', { name: nameIn(s.submitted_by_member_id, s.members) })
              }}</span>
            </div>
          </li>
        </ul>
      </template>
    </AsyncState>
  </section>
</template>

<style scoped>
.my-work__alert {
  margin-bottom: 12px;
}
.my-work__alert a {
  margin-left: 6px;
}
/* Room for the close button beside a long notice. */
.my-work__alert:deep(.el-alert__content) {
  padding-right: 24px;
}
.my-work__draft {
  display: flex;
  flex-direction: column;
}
.my-work__draft-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.my-work__started {
  font-size: var(--app-text-xs);
}
.my-work__label {
  font-size: var(--app-text-sm);
  font-weight: 500;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}
.my-work__label--files {
  margin-top: 16px;
}
.my-work__files {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
}
.my-work__files li {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
.my-work__files li + li {
  margin-top: 6px;
}
.my-work__files li > .doc-files {
  flex: 1;
}
.my-work__nofiles {
  margin: 0 0 8px;
  font-size: var(--app-text-sm);
}
.my-work__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.my-work__saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--app-text-xs);
}
.my-work__start-text {
  margin: 0 0 12px;
  font-size: var(--app-text-md);
  line-height: var(--app-lh-text);
}
.my-work__start-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.my-work__start-actions .app-form-hint {
  margin-top: 0;
}
.my-work__group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 24px;
  margin: 0 0 12px;
  font-size: var(--app-text-sm);
}
.my-work__group dt {
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.my-work__group dd {
  margin: 0;
  font-weight: var(--app-weight-strong);
  overflow-wrap: anywhere;
}
.my-work__left-out p,
.my-work__no-group p {
  margin: 0 0 6px;
}
.my-work__no-group p:last-child {
  margin-bottom: 0;
}
.my-work__join {
  display: inline-block;
  margin-top: 4px;
}
.my-work__conflict-body {
  margin: 4px 0;
}
.my-work__kept {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-lighter);
}
.my-work__kept-title {
  margin: 0 0 4px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.my-work__kept-hint {
  margin: 0 0 8px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-secondary);
}
.my-work__kept-text {
  margin: 0;
  padding: 8px 12px;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  user-select: text;
}
.my-work__kept-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.my-work__theirs {
  margin: 6px 0;
  padding: 8px 12px;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}
.my-work__conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.my-work__label--text {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
}
.my-work__revised {
  font-size: var(--app-text-xs);
  font-weight: 400;
}
.my-work__attempt-who {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
}
.my-work__subtitle {
  margin: 20px 0 8px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.my-work__attempts {
  list-style: none;
  margin: 0;
  padding: 0;
}
.my-work__attempt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: var(--app-text-sm);
}
.my-work__attempt-main,
.my-work__attempt-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.my-work__attempt-side a {
  text-decoration: none;
}
.my-work__grade {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
</style>
