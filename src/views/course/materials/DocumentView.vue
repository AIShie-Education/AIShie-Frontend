<script setup lang="ts">
// One document: material, an assignment's instructions or rubric, or (reached
// by id from a submission or a grade) a submitted or feedback file.
//
// What is shown is what Core hands the caller (document.get): the published
// version to anyone who cannot read drafts, the latest to those who can, or a
// version named in ?version=. Readers of drafts also get the version history
// (document.versions), and writers add versions, publish any of them (which
// only moves the pointer), rename it or move it in its list (document.update),
// archive it and bring it back (document.unarchive). An administrator of the
// course purges a version, or the whole document, uploaded by mistake
// (document.purge), for material, instructions and rubrics only; what was
// purged shows its tombstone — who purged it, when and why — instead of its
// content or a download.
//
// A version is text, files, or both (AIShie-Core #49): its files are listed
// in order under its number, each with an icon by its type, its name and
// size, to download under its name (VersionFileList).
//
// Each file of material, instructions or a rubric has a text version
// (文字版) as well, on a tab of its own beside the version's content
// (?tab=text, and ?file= for a file other than the first): the file
// transcribed into Markdown by the school's transcriber, or written by staff
// (TextVersionPane, one for each file, so that a draft of one is kept while
// another is read). A version of several files picks the file there, each
// saying where its text version stands. Whether the transcriber is on is the
// runtime's to say (info.features.transcription): without a runtime that
// says so, a text waiting for it is shown as none.
//
// A new version opens on a drop zone for its files. Whoever may add one can
// also drop files anywhere on the page, which opens it with them.
//
// A file opens in the file viewer (預覽); the version's text note, and each
// file's text version, may be downloaded as a PDF (下載為 PDF), through the
// browser's print window.
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { read, type UploadKind } from '@/api/http'
import type { AssignmentSummary, DocumentVersion } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useAdministersCourse } from '@/composables/useAdministersCourse'
import { useCourseTab } from '@/composables/useCourseTab'
import { usePageDrop } from '@/composables/useFileDrop'
import { useRuntime } from '@/composables/useRuntime'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { versionFilesOf } from '@/utils/documentFiles'
import AppEmpty from '@/components/AppEmpty.vue'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import MemberName from '@/components/MemberName.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import DocumentDetailsDialog from './components/DocumentDetailsDialog.vue'
import PendingAlert from './components/PendingAlert.vue'
import PurgeDialog from './components/PurgeDialog.vue'
import TextVersionPane from './components/TextVersionPane.vue'
import Tombstone from './components/Tombstone.vue'
import VersionDialog from './components/VersionDialog.vue'
import VersionHistory from './components/VersionHistory.vue'
import VersionFileList from '@/components/VersionFileList.vue'
import PrintButton from '@/components/PrintButton.vue'
import { courseLine, dateLine, type PrintRequest } from '@/composables/usePrintLayout'
import type { DocumentFile } from '@/api/types'
import TextFilePicker from './components/TextFilePicker.vue'
import { textTabShown } from './components/textVersion'

const props = defineProps<{ courseId: string; documentId: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const course = useCourseStore()

const COURSE_LEVEL = ['material', 'instructions', 'rubric']

// ?version=<id>: a particular version, e.g. the one a submission was handed in under.
const versionParam = computed(() => {
  const v = route.query.version
  return typeof v === 'string' && v ? v : undefined
})

const docState = useAsync(
  () =>
    read('document.get', {
      course_id: props.courseId,
      document_id: props.documentId,
      version_id: versionParam.value,
    }),
  { watch: [() => props.documentId, versionParam], keepData: true },
)
// Kept while another version loads; dropped when what was asked for cannot be read.
const doc = computed(() => (docState.error.value ? undefined : docState.data.value))
const shown = computed(() => doc.value?.version ?? null)
const kind = computed(() => doc.value?.kind ?? '')
const courseLevel = computed(() => COURSE_LEVEL.includes(kind.value))

// The tab a document belongs under: material under Materials (the route's own),
// an assignment's instructions or rubric under Assignments, a submitted file
// under Submissions and a feedback file under Grades.
const TAB_OF_KIND: Record<string, string | null> = {
  material: null,
  instructions: 'course-assignments',
  rubric: 'course-assignments',
  submission: 'course-submissions',
  feedback: 'course-grades',
}
useCourseTab(() => TAB_OF_KIND[kind.value] ?? null)

const active = computed(() => doc.value?.status === 'active')

// The version history is for readers of drafts, and only course-level
// documents have one (an owned file has exactly one version). Where the seat's
// permissions cannot be known it is asked for; a refusal settles it.
const versionsState = useAsync(
  () =>
    read('document.versions', { course_id: props.courseId, document_id: props.documentId }).then(
      (o) => o.versions ?? [],
    ),
  { immediate: false, keepData: true },
)
const draftsRefused = computed(() => !!versionsState.error.value?.isForbidden)
const showVersions = computed(
  () => !!doc.value && courseLevel.value && course.can('document_read_draft') && !draftsRefused.value,
)
watch(
  [() => props.documentId, showVersions],
  ([, show]) => {
    if (show) void versionsState.reload()
  },
  { immediate: true },
)
const versions = computed<DocumentVersion[]>(() => (showVersions.value ? (versionsState.data.value ?? []) : []))
const latest = computed(() =>
  versions.value.reduce<DocumentVersion | null>((m, v) => (!m || v.seq > m.seq ? v : m), null),
)
const publishedVersion = computed(() => versions.value.find((v) => v.published) ?? null)

function reloadAll() {
  void docState.reload()
  if (showVersions.value) void versionsState.reload()
}

// The assignment that uses this document as its instructions or rubric, where
// the caller can see one. Two may share it; a published one is named first,
// since it is what makes the document readable.
onMounted(() => void course.ensureAssignments())
const owner = computed<AssignmentSummary | null>(() => {
  let found: AssignmentSummary | null = null
  for (const a of course.assignments.values()) {
    if (a.instructions_document_id !== props.documentId && a.rubric_document_id !== props.documentId) continue
    if (a.published_at) return a
    found ??= a
  }
  return found
})
// Instructions and a rubric follow their assignment: until a published one
// refers to them, nobody who cannot see unpublished assignments reads them.
const unreleased = computed(
  () => (kind.value === 'instructions' || kind.value === 'rubric') && !!owner.value && !owner.value.published_at,
)

const back = computed<RouteLocationRaw>(() => {
  const params = { courseId: props.courseId }
  const d = doc.value
  switch (d?.kind) {
    case 'instructions':
    case 'rubric':
      return owner.value
        ? { name: 'course-assignment', params: { ...params, assignmentId: owner.value.id } }
        : { name: 'course-assignments', params }
    case 'submission':
      return d.submission_id
        ? { name: 'course-submission', params: { ...params, submissionId: d.submission_id } }
        : { name: 'course-submissions', params }
    case 'feedback':
      return d.grade_id
        ? { name: 'course-grade', params: { ...params, gradeId: d.grade_id } }
        : { name: 'course-grades', params }
  }
  return { name: 'course-materials', params }
})

// Looking at a version that is neither the current one nor the published one.
const viewingOther = computed(() => {
  const v = shown.value
  if (!versionParam.value || !v) return false
  if (latest.value) return v.id !== latest.value.id
  return !v.published
})
function showCurrent() {
  void router.replace({ name: 'course-document', params: { courseId: props.courseId, documentId: props.documentId } })
}

// What everyone else reads, told to those who see more than that.
const readersNote = computed(() => {
  const d = doc.value
  const v = shown.value
  if (!d || !v || !showVersions.value || !active.value) return null
  if (unreleased.value) {
    return {
      type: 'info' as const,
      text: t(`materials.document.readers.unreleased.${d.kind as 'instructions' | 'rubric'}`),
    }
  }
  if (!d.published_version_id) return { type: 'warning' as const, text: t('materials.document.readers.none') }
  if (v.published) return { type: 'success' as const, text: t('materials.document.readers.this') }
  return {
    type: 'info' as const,
    text: publishedVersion.value
      ? t('materials.document.readers.other', { seq: publishedVersion.value.seq })
      : t('materials.document.readers.otherUnknown'),
  }
})

// Names come from the member list; without it only one's own name is known.
const showAuthor = computed(
  () => !!shown.value && (course.can('member_read') || shown.value.author_member_id === course.myMemberId),
)

// What was purged: the whole document, or the version on screen. Its text and
// file are gone; what is left says who removed them, when and why.
const docPurge = computed(() => doc.value?.purged ?? null)
const versionPurge = computed(() => shown.value?.purged ?? null)
const purged = computed(() => !!doc.value?.purged_at || !!docPurge.value)

/** The version's files, in order; none once it is purged. */
const files = computed(() => (versionPurge.value || docPurge.value ? [] : versionFilesOf(shown.value)))
const hasFile = computed(() => files.value.length > 0)

// Writing: material, instructions and rubrics are written with document_write.
const canWrite = computed(() => courseLevel.value && course.can('document_write'))
// Purging is an administrator's, of material, instructions and rubrics alone,
// and works in an archived course too.
const administers = useAdministersCourse()
const canPurge = computed(() => courseLevel.value && administers.value && !purged.value)
/** Bringing an archived document back is for whoever may archive it; a purged one stays archived. */
const canUnarchive = computed(() => canWrite.value && doc.value?.status === 'archived' && !purged.value)
const writeDisabled = computed(() => !course.writable || !active.value)
const needsApproval = computed(() => course.needsApproval('document_write'))

const pendingNote = ref<string | null>(null)
const editing = ref(false)

// A new version, opened by its button or by a file dropped on the page.
const droppedFiles = ref<File[]>([])
function openVersion(files: File[] = []) {
  droppedFiles.value = files
  editing.value = true
}
const pageDrop = usePageDrop({
  // Not while another dialog of the page is open over it.
  enabled: () =>
    canWrite.value &&
    active.value &&
    !writeDisabled.value &&
    !purged.value &&
    !editing.value &&
    !detailsOpen.value &&
    !purgeOpen.value,
  onFiles: (dropped) => {
    if (dropped.length) openVersion(dropped)
  },
})

function lines(parts: (string | false | null | undefined)[]) {
  return h(
    'div',
    { class: 'doc-confirm' },
    parts.filter((p): p is string => !!p).map((p) => h('p', { style: 'margin: 0 0 8px; line-height: 1.55' }, p)),
  )
}

const publisher = useWrite('document.publish')
async function publishVersion(v: { id: string; seq: number }) {
  const d = doc.value
  if (!d) return
  const bodyKey = d.kind === 'instructions' || d.kind === 'rubric' ? d.kind : 'material'
  try {
    await ElMessageBox.confirm(
      lines([
        t(`materials.document.publish.body.${bodyKey}`, { seq: v.seq, title: d.title }),
        !!latest.value && v.seq < latest.value.seq && t('materials.document.publish.older'),
        unreleased.value && t('materials.document.publish.unreleased'),
        needsApproval.value && t('materials.document.approvalNote'),
      ]),
      t('materials.document.publish.title', { seq: v.seq }),
      {
        type: 'info',
        confirmButtonText: t('common.actions.publish'),
        cancelButtonText: t('common.actions.cancel'),
      },
    )
  } catch {
    return
  }
  const out = await publisher.run(
    { course_id: props.courseId, document_id: d.id, version_id: v.id },
    { success: t('materials.document.publish.done', { seq: v.seq }) },
  )
  if (!out) return
  if (out.status === 'proposed') {
    pendingNote.value = t('materials.document.publish.pending', { seq: v.seq })
    return
  }
  pendingNote.value = null
  reloadAll()
}

const archiver = useWrite('document.archive')
async function archive() {
  const d = doc.value
  if (!d) return
  try {
    await ElMessageBox.confirm(
      lines([
        t('materials.document.archive.body'),
        !!owner.value && t('materials.document.archive.usedBy', { assignment: owner.value.title }),
        needsApproval.value && t('materials.document.approvalNote'),
      ]),
      t('materials.document.archive.title', { title: d.title }),
      {
        type: 'warning',
        confirmButtonText: t('common.actions.archive'),
        cancelButtonText: t('common.actions.cancel'),
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  const out = await archiver.run(
    { course_id: props.courseId, document_id: d.id },
    { success: t('materials.document.archive.done') },
  )
  if (!out) return
  if (out.status === 'proposed') {
    pendingNote.value = t('materials.document.archive.pending')
    return
  }
  pendingNote.value = null
  reloadAll()
}

// --- What it is called, and where it is listed -------------------------------
const detailsOpen = ref(false)
function onDetails(status: 'executed' | 'proposed') {
  if (status === 'proposed') {
    pendingNote.value = t('materials.document.details.pending')
    return
  }
  pendingNote.value = null
  reloadAll()
}

// --- Bringing it back from the archive -----------------------------------------
const unarchiver = useWrite('document.unarchive')
async function unarchive() {
  const d = doc.value
  if (!d) return
  try {
    await ElMessageBox.confirm(
      lines([t('materials.document.unarchive.body'), needsApproval.value && t('materials.document.approvalNote')]),
      t('materials.document.unarchive.title', { title: d.title }),
      {
        type: 'info',
        confirmButtonText: t('materials.document.actions.unarchive'),
        cancelButtonText: t('common.actions.cancel'),
      },
    )
  } catch {
    return
  }
  const out = await unarchiver.run(
    { course_id: props.courseId, document_id: d.id },
    { success: t('materials.document.unarchive.done'), reasons: 'materials.refusal' },
  )
  if (!out) return
  if (out.status === 'proposed') {
    pendingNote.value = t('materials.document.unarchive.pending')
    return
  }
  pendingNote.value = null
  reloadAll()
}

// --- Purging ---------------------------------------------------------------------
const purgeOpen = ref(false)
const purgeVersion = ref<{ id: string; seq: number } | null>(null)
function openPurge(v: { id: string; seq: number } | null) {
  purgeVersion.value = v
  purgeOpen.value = true
}
function onPurged() {
  pendingNote.value = null
  reloadAll()
}

function onVersionSaved() {
  pendingNote.value = null
  // Show the new version: the latest is what the page shows by default.
  if (versionParam.value) showCurrent()
  reloadAll()
}
function onVersionProposed(publish: boolean) {
  pendingNote.value = publish
    ? t('materials.document.addVersion.pendingPublish')
    : t('materials.document.addVersion.pending')
}

const uploadKind = computed(() => (courseLevel.value ? kind.value : 'material') as UploadKind)

// --- The text versions, one for each file ------------------------------------------
const rt = useRuntime()
const transcriptionOn = computed(() => !!rt.info.value?.features.transcription)
/** The tab is there where any file's text version is worth it (textTabShown). */
const textTab = computed(
  () =>
    !!shown.value &&
    files.value.some((f) =>
      textTabShown({
        text: f.text ?? null,
        courseLevel: courseLevel.value,
        purged: !!versionPurge.value || !!docPurge.value,
        hasFile: true,
        canWrite: canWrite.value,
        transcriptionOn: transcriptionOn.value,
      }),
    ),
)
/** The tab shown in the version's card, remembered in the address (?tab=text). */
const contentTab = computed({
  get: () => (route.query.tab === 'text' && textTab.value ? 'text' : 'content'),
  set: (v: string) => void router.replace({ query: { ...route.query, tab: v === 'text' ? 'text' : undefined } }),
})
/** The file whose text version is shown: ?file=, or the first. */
const textFile = computed<DocumentFile | null>(() => {
  const want = route.query.file
  return files.value.find((f) => f.id === want) ?? files.value[0] ?? null
})
/** Shows a file's text version, remembering it in the address (none for the first). */
function showText(f: DocumentFile) {
  const first = files.value[0]?.id === f.id
  void router.replace({ query: { ...route.query, tab: 'text', file: first ? undefined : f.id } })
}

function onTextProposed(message: string) {
  pendingNote.value = message
}

// --- The version's text note, downloaded as a PDF ----------------------------------------
function noteSource(): PrintRequest {
  const d = doc.value!
  const v = shown.value!
  const when = dateLine(v.created_at)
  // An owned file has one version, which needs no number.
  const version = courseLevel.value ? `${t('materials.document.version', { seq: v.seq })} · ${when}` : when
  return {
    title: d.title,
    lines: [courseLine(props.courseId), version],
    body: { markdown: v.body_md ?? '' },
  }
}
</script>

<template>
  <div class="doc-view">
    <PageHeader :title="doc?.title ?? t('materials.document.title')" :back="back">
      <template v-if="doc" #tags>
        <StatusTag vocab="documentKind" :value="doc.kind" />
        <StatusTag v-if="doc.status !== 'active'" vocab="documentStatus" :value="doc.status" />
        <AppTag v-else-if="courseLevel && !doc.published_version_id" tone="wait">
          {{ t('materials.document.notPublished') }}
        </AppTag>
      </template>
      <template v-if="doc && (canWrite || canPurge)" #default>
        <template v-if="canWrite && active">
          <el-button type="primary" :disabled="writeDisabled" @click="openVersion()">
            <el-icon><EditPen /></el-icon>
            <span>{{ t('materials.document.actions.newVersion') }}</span>
          </el-button>
          <el-button
            v-if="shown && !shown.published && !shown.purged"
            :disabled="writeDisabled"
            :loading="publisher.pending.value"
            @click="publishVersion(shown)"
          >
            <el-icon><Promotion /></el-icon>
            <span>{{ t('materials.document.actions.publishThis') }}</span>
          </el-button>
        </template>
        <el-button v-if="canWrite" :disabled="!course.writable" @click="detailsOpen = true">
          <el-icon><Edit /></el-icon>
          <span>{{ t('materials.document.actions.details') }}</span>
        </el-button>
        <el-button
          v-if="canWrite && active"
          type="danger"
          plain
          :disabled="writeDisabled"
          :loading="archiver.pending.value"
          @click="archive"
        >
          <el-icon><FolderRemove /></el-icon>
          <span>{{ t('materials.document.actions.archive') }}</span>
        </el-button>
        <el-button
          v-if="canUnarchive"
          type="primary"
          plain
          :disabled="!course.writable"
          :loading="unarchiver.pending.value"
          @click="unarchive"
        >
          <el-icon><RefreshLeft /></el-icon>
          <span>{{ t('materials.document.actions.unarchive') }}</span>
        </el-button>
        <StatusTag
          v-if="canWrite && needsApproval"
          vocab="level"
          value="confirm_required"
          class="doc-view__approval"
          size="default"
        />
        <el-tooltip v-if="canPurge" :content="t('materials.document.purge.adminOnly')" placement="bottom">
          <el-button type="danger" plain @click="openPurge(null)">
            <el-icon><Delete /></el-icon>
            <span>{{ t('materials.document.actions.purge') }}</span>
          </el-button>
        </el-tooltip>
      </template>
    </PageHeader>

    <PendingAlert v-if="pendingNote" :course-id="courseId" :message="pendingNote" @close="pendingNote = null" />

    <AsyncState
      :loading="docState.loading.value"
      :overlay="!!doc"
      :error="docState.error.value"
      @retry="docState.reload"
    >
      <template v-if="doc">
        <Tombstone v-if="docPurge" :purge="docPurge" of="document" class="doc-view__alert" />
        <el-alert
          v-else-if="doc.status !== 'active' && courseLevel"
          type="info"
          :closable="false"
          show-icon
          class="doc-view__alert"
          :title="t('materials.document.archivedAlert')"
        />
        <el-alert v-if="viewingOther && shown" type="warning" :closable="false" show-icon class="doc-view__alert">
          <template #title>
            <span class="doc-view__alert-line">
              {{
                showVersions
                  ? t('materials.document.viewingOther', { seq: shown.seq })
                  : t('materials.document.viewingPinned', { seq: shown.seq })
              }}
              <el-button link type="primary" @click="showCurrent">{{ t('materials.document.showCurrent') }}</el-button>
            </span>
          </template>
        </el-alert>
        <el-alert
          v-else-if="readersNote"
          :type="readersNote.type"
          :closable="false"
          show-icon
          class="doc-view__alert"
          :title="readersNote.text"
        />

        <div class="doc-layout app-columns">
          <main class="doc-layout__main app-column">
            <section class="app-card doc-content">
              <!-- Where a file dragged over the page will go. -->
              <div v-if="pageDrop.dragging.value" class="doc-content__drop" aria-hidden="true">
                <el-icon class="doc-content__drop-icon"><UploadFilled /></el-icon>
                <span>{{ t('materials.document.dropHere') }}</span>
              </div>
              <template v-if="shown">
                <div class="doc-content__meta">
                  <!-- An owned file has exactly one version, and nothing to publish. -->
                  <template v-if="courseLevel">
                    <span class="doc-content__seq">{{ t('materials.document.version', { seq: shown.seq }) }}</span>
                    <AppTag v-if="shown.purged" tone="danger">
                      {{ t('materials.document.tombstone.tag') }}
                    </AppTag>
                    <AppTag v-if="shown.published" tone="done">
                      {{ t('materials.document.published') }}
                    </AppTag>
                    <AppTag v-else-if="showVersions" tone="wait">
                      {{ t('materials.document.notPublished') }}
                    </AppTag>
                    <AppTag v-if="latest && latest.id === shown.id" variant="outline">
                      {{ t('materials.document.latest') }}
                    </AppTag>
                  </template>
                  <el-button
                    v-if="canPurge && courseLevel && !shown.purged"
                    link
                    type="danger"
                    size="small"
                    class="doc-content__purge"
                    @click="openPurge(shown)"
                  >
                    <el-icon><Delete /></el-icon><span>{{ t('materials.document.purge.version') }}</span>
                  </el-button>
                  <span class="doc-content__by">
                    <template v-if="showAuthor">
                      <MemberName :id="shown.author_member_id" show-kind />
                      <span class="doc-content__dot">·</span>
                    </template>
                    <TimeText :value="shown.created_at" />
                  </span>
                  <PrintButton
                    v-if="shown.body_md && !versionPurge && contentTab !== 'text'"
                    link
                    :source="noteSource"
                    class="doc-content__print"
                  />
                </div>

                <Tombstone v-if="versionPurge && !docPurge" :purge="versionPurge" of="version" />

                <el-tabs v-if="textTab" v-model="contentTab" class="doc-content__tabs">
                  <el-tab-pane :label="t('materials.document.text.tabs.content')" name="content" />
                  <el-tab-pane :label="t('materials.document.text.tabs.text')" name="text" />
                </el-tabs>

                <template v-if="textTab">
                  <!-- Which file's text version: one of several, each saying where its text stands. -->
                  <TextFilePicker
                    v-show="contentTab === 'text'"
                    :files="files"
                    :selected="textFile"
                    :transcription-on="transcriptionOn"
                    @pick="showText"
                  />
                  <!-- One for each file, kept while another is shown, with a draft being written in it. -->
                  <TextVersionPane
                    v-for="f in files"
                    v-show="contentTab === 'text' && f === textFile"
                    :key="`${shown.id}/${f.id}`"
                    :course-id="courseId"
                    :document-id="doc.id"
                    :version-id="shown.id"
                    :seq="shown.seq"
                    :file-id="f.id"
                    :file-name="f.filename"
                    :position="f.position"
                    :initial="f.text ?? null"
                    :has-file="true"
                    :active="contentTab === 'text' && f === textFile"
                    :can-write="canWrite"
                    :write-disabled="writeDisabled"
                    :needs-approval="needsApproval"
                    :transcription-on="transcriptionOn"
                    :doc-title="doc.title"
                    @changed="reloadAll"
                    @proposed="onTextProposed"
                  />
                </template>

                <VersionFileList
                  v-if="hasFile && contentTab !== 'text'"
                  class="doc-content__files"
                  :course-id="courseId"
                  :document-id="doc.id"
                  :version-id="shown.id"
                  :files="files"
                  :doc-title="doc.title"
                  :date="shown.created_at"
                  :text-status="textTab"
                  :transcription-on="transcriptionOn"
                  :open-text="textTab"
                  :retry-renditions="!!canWrite && !writeDisabled"
                  @text="showText"
                />

                <div v-if="!versionPurge && contentTab !== 'text'" class="doc-content__body">
                  <MarkdownView
                    :source="shown.body_md"
                    :empty="hasFile ? t('materials.document.noText', files.length) : t('common.labels.empty')"
                  />
                </div>
              </template>
              <AppEmpty
                v-else
                :text="showVersions ? t('materials.document.emptyDoc') : t('materials.document.noVersion')"
              >
                <el-button v-if="canWrite && active" type="primary" :disabled="writeDisabled" @click="openVersion()">
                  {{ t('materials.document.addFirst') }}
                </el-button>
              </AppEmpty>
            </section>
          </main>

          <aside class="doc-layout__side app-column">
            <section v-if="showVersions" class="app-card">
              <h2 class="app-card__title">{{ t('materials.document.versions.title') }}</h2>
              <p class="doc-side__hint">{{ t('materials.document.versions.hint') }}</p>
              <VersionHistory
                :course-id="courseId"
                :document-id="documentId"
                :versions="versions"
                :loading="versionsState.loading.value"
                :error="versionsState.error.value"
                :shown-id="shown?.id ?? null"
                :latest-id="latest?.id ?? null"
                :can-publish="canWrite && active"
                :publish-disabled="writeDisabled || publisher.pending.value"
                :can-purge="canPurge"
                @publish="publishVersion"
                @purge="openPurge"
                @retry="versionsState.reload"
              />
            </section>

            <section class="app-card">
              <h2 class="app-card__title">{{ t('materials.document.about') }}</h2>
              <dl class="doc-facts">
                <dt>{{ t('materials.document.kind') }}</dt>
                <dd><StatusTag vocab="documentKind" :value="doc.kind" /></dd>
                <dt>{{ t('materials.document.status') }}</dt>
                <dd><StatusTag vocab="documentStatus" :value="doc.status" /></dd>
                <template v-if="doc.kind === 'material'">
                  <dt>{{ t('materials.document.sortOrder') }}</dt>
                  <dd>{{ doc.sort_order }}</dd>
                </template>
                <dt>{{ t('materials.document.created') }}</dt>
                <dd><TimeText :value="doc.created_at" /></dd>
                <template v-if="doc.kind === 'instructions' || doc.kind === 'rubric'">
                  <dt>{{ t('materials.document.usedBy') }}</dt>
                  <dd>
                    <i18n-t v-if="owner" :keypath="`materials.document.usedAs.${doc.kind}`" tag="span" scope="global">
                      <template #assignment>
                        <router-link
                          :to="{ name: 'course-assignment', params: { courseId, assignmentId: owner.id } }"
                          >{{ owner.title }}</router-link
                        >
                      </template>
                    </i18n-t>
                    <AppTag v-if="owner && !owner.published_at" tone="wait" class="doc-facts__tag">
                      {{ t('materials.document.unpublishedAssignment') }}
                    </AppTag>
                    <span v-if="!owner" class="app-muted">{{ t('materials.document.notUsed') }}</span>
                  </dd>
                </template>
              </dl>
              <p v-if="courseLevel" class="doc-side__hint doc-side__rules">
                {{ t(`materials.document.rules.${doc.kind}`) }}
              </p>
              <template v-else-if="doc.kind === 'submission' || doc.kind === 'feedback'">
                <p class="doc-side__hint doc-side__rules">{{ t(`materials.document.owned.${doc.kind}`) }}</p>
                <router-link :to="back" class="doc-side__owner">
                  <el-icon><Right /></el-icon>
                  {{
                    doc.kind === 'submission'
                      ? t('materials.document.owned.openSubmission')
                      : t('materials.document.owned.openGrade')
                  }}
                </router-link>
              </template>
            </section>
          </aside>
        </div>
      </template>
    </AsyncState>
    <div v-if="docState.error.value && versionParam" class="doc-view__retry-current">
      <el-button @click="showCurrent">{{ t('materials.document.showCurrent') }}</el-button>
    </div>

    <DocumentDetailsDialog
      v-if="doc && canWrite"
      v-model="detailsOpen"
      :course-id="courseId"
      :doc="doc"
      @done="onDetails"
    />
    <PurgeDialog
      v-if="doc && canPurge"
      v-model="purgeOpen"
      :course-id="courseId"
      :document-id="doc.id"
      :title="doc.title"
      :version="purgeVersion"
      @done="onPurged"
    />
    <VersionDialog
      v-if="doc && canWrite"
      v-model="editing"
      :course-id="courseId"
      :document-id="doc.id"
      :kind="uploadKind"
      :doc-title="doc.title"
      :unreleased="unreleased"
      :files="droppedFiles"
      @saved="onVersionSaved"
      @proposed="onVersionProposed"
    />
  </div>
</template>

<style scoped>
.doc-view__approval {
  align-self: center;
}
.doc-view__alert {
  margin-bottom: 16px;
}
.doc-view__alert-line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.doc-view__retry-current {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}
/* The page's own width decides its columns, not the window's: the side bar takes from it. */
.doc-view {
  container-type: inline-size;
}
.doc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
}
/* Two columns while the text keeps 420 px or more beside the 320 px one. */
@container (max-width: 759px) {
  .doc-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
.doc-content {
  position: relative;
}
/* A file dragged over the page: the version's card is where it goes. */
.doc-content__drop {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed var(--el-color-primary);
  border-radius: inherit;
  background: color-mix(in srgb, var(--app-indigo-tint) 88%, transparent);
  color: var(--el-color-primary);
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  padding: 16px;
  pointer-events: none;
}
.doc-content__drop-icon {
  font-size: 32px;
}
.doc-content__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}
.doc-content__seq {
  font-weight: 600;
}
.doc-content__by {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  color: var(--el-text-color-secondary);
}
.doc-content__print {
  margin-left: auto;
}
.doc-content__dot {
  color: var(--el-text-color-placeholder);
}
.doc-content__body {
  overflow-wrap: anywhere;
}
.doc-content__tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
.doc-content__files {
  margin-bottom: 16px;
}
.doc-side__hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.doc-side__rules {
  margin: 12px 0 0;
}
.doc-side__owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 13px;
}
.doc-facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 13px;
  align-items: center;
}
.doc-facts dt {
  color: var(--el-text-color-secondary);
}
.doc-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.doc-facts__tag {
  margin-left: 6px;
}
</style>
