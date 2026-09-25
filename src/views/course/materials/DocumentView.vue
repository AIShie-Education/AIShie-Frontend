<script setup lang="ts">
// One document: material, an assignment's instructions or rubric, or (reached
// by id from a submission or a grade) a submitted or feedback file.
//
// What is shown is what Core hands the caller (document.get): the published
// version to anyone who cannot read drafts, the latest to those who can, or a
// version named in ?version=. Readers of drafts also get the version history
// (document.versions), and writers add versions, publish any of them (which
// only moves the pointer) and archive the document.
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { read, type UploadKind } from '@/api/http'
import type { AssignmentSummary, DocumentVersion } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { formatBytes } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import DocumentFileLink from '@/components/DocumentFileLink.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import AuthorName from './components/AuthorName.vue'
import PendingAlert from './components/PendingAlert.vue'
import VersionDialog from './components/VersionDialog.vue'
import VersionHistory from './components/VersionHistory.vue'

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
// the caller can see one.
onMounted(() => void course.ensureAssignments())
const owner = computed<AssignmentSummary | null>(() => {
  for (const a of course.assignments.values()) {
    if (a.instructions_document_id === props.documentId || a.rubric_document_id === props.documentId) return a
  }
  return null
})
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

const hasFile = computed(() => !!shown.value && (!!shown.value.download_url || !!shown.value.content_type))
// "sha256:44c38a…" shown as "sha256 44c38a1b2c3d".
const checksumShort = computed(() => {
  const c = shown.value?.checksum
  if (!c) return null
  const i = c.indexOf(':')
  return i > 0 ? `${c.slice(0, i)} ${c.slice(i + 1, i + 13)}` : c.slice(0, 12)
})

// Writing: material, instructions and rubrics are written with document_write.
const canWrite = computed(() => courseLevel.value && course.can('document_write'))
const writeDisabled = computed(() => !course.writable || !active.value)
const needsApproval = computed(() => course.needsApproval('document_write'))

const pendingNote = ref<string | null>(null)
const editing = ref(false)

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
        t('common.confirm.irreversible'),
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
</script>

<template>
  <div class="doc-view">
    <PageHeader :title="doc?.title ?? t('materials.document.title')" :back="back">
      <template v-if="doc" #tags>
        <StatusTag vocab="documentKind" :value="doc.kind" />
        <StatusTag v-if="doc.status !== 'active'" vocab="documentStatus" :value="doc.status" />
        <el-tag v-else-if="courseLevel && !doc.published_version_id" type="warning" size="small" disable-transitions>
          {{ t('materials.document.notPublished') }}
        </el-tag>
      </template>
      <template v-if="doc && canWrite && active" #default>
        <el-button type="primary" :disabled="writeDisabled" @click="editing = true">
          <el-icon><EditPen /></el-icon>
          <span>{{ t('materials.document.actions.newVersion') }}</span>
        </el-button>
        <el-button
          v-if="shown && !shown.published"
          :disabled="writeDisabled"
          :loading="publisher.pending.value"
          @click="publishVersion(shown)"
        >
          <el-icon><Promotion /></el-icon>
          <span>{{ t('materials.document.actions.publishThis') }}</span>
        </el-button>
        <el-button type="danger" plain :disabled="writeDisabled" :loading="archiver.pending.value" @click="archive">
          <el-icon><FolderRemove /></el-icon>
          <span>{{ t('materials.document.actions.archive') }}</span>
        </el-button>
        <el-tag v-if="needsApproval" type="warning" class="doc-view__approval" disable-transitions>
          {{ t('enums.level.confirm_required') }}
        </el-tag>
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
        <el-alert
          v-if="doc.status !== 'active' && courseLevel"
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

        <div class="doc-layout">
          <main class="doc-layout__main">
            <section class="app-card doc-content">
              <template v-if="shown">
                <div class="doc-content__meta">
                  <!-- An owned file has exactly one version, and nothing to publish. -->
                  <template v-if="courseLevel">
                    <span class="doc-content__seq">{{ t('materials.document.version', { seq: shown.seq }) }}</span>
                    <el-tag v-if="shown.published" type="success" size="small" disable-transitions>
                      {{ t('materials.document.published') }}
                    </el-tag>
                    <el-tag v-else-if="showVersions" type="warning" size="small" disable-transitions>
                      {{ t('materials.document.notPublished') }}
                    </el-tag>
                    <el-tag v-if="latest && latest.id === shown.id" size="small" effect="plain" disable-transitions>
                      {{ t('materials.document.latest') }}
                    </el-tag>
                  </template>
                  <span class="doc-content__by">
                    <template v-if="showAuthor">
                      <AuthorName :id="shown.author_member_id" />
                      <span class="doc-content__dot">·</span>
                    </template>
                    <TimeText :value="shown.created_at" />
                  </span>
                </div>

                <div v-if="hasFile" class="doc-file">
                  <el-icon class="doc-file__icon"><Document /></el-icon>
                  <div class="doc-file__text">
                    <DocumentFileLink
                      :course-id="courseId"
                      :document-id="doc.id"
                      :version-id="shown.id"
                      :title="t('materials.document.downloadFile')"
                    />
                    <span class="doc-file__meta">
                      {{ shown.content_type ?? '—' }} · {{ formatBytes(shown.byte_size) }}
                      <template v-if="checksumShort">
                        ·
                        <span class="doc-file__sum" :title="shown.checksum ?? undefined">
                          {{ t('materials.document.checksum') }} {{ checksumShort }}
                        </span>
                      </template>
                    </span>
                  </div>
                </div>

                <div class="doc-content__body">
                  <MarkdownView
                    :source="shown.body_md"
                    :empty="hasFile ? t('materials.document.noText') : t('common.labels.empty')"
                  />
                </div>
              </template>
              <el-empty
                v-else
                :description="showVersions ? t('materials.document.emptyDoc') : t('materials.document.noVersion')"
              >
                <el-button v-if="canWrite && active" type="primary" :disabled="writeDisabled" @click="editing = true">
                  {{ t('materials.document.addFirst') }}
                </el-button>
              </el-empty>
            </section>
          </main>

          <aside class="doc-layout__side">
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
                @publish="publishVersion"
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
                    <el-tag v-if="owner && !owner.published_at" size="small" type="info" class="doc-facts__tag">
                      {{ t('materials.document.unpublishedAssignment') }}
                    </el-tag>
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

    <VersionDialog
      v-if="doc && canWrite"
      v-model="editing"
      :course-id="courseId"
      :document-id="doc.id"
      :kind="uploadKind"
      :doc-title="doc.title"
      :unreleased="unreleased"
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
.doc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}
.doc-layout__main,
.doc-layout__side {
  min-width: 0;
}
@media (max-width: 1000px) {
  .doc-layout {
    grid-template-columns: minmax(0, 1fr);
  }
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
.doc-content__dot {
  color: var(--el-text-color-placeholder);
}
.doc-content__body {
  overflow-wrap: anywhere;
}
.doc-file {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}
.doc-file__icon {
  font-size: 22px;
  color: var(--el-color-primary);
  margin-top: 2px;
  flex-shrink: 0;
}
.doc-file__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}
.doc-file__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow-wrap: anywhere;
}
.doc-file__sum {
  font-family: var(--app-font-mono);
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
