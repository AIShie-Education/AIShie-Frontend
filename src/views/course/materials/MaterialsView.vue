<script setup lang="ts">
// The course's material (document.list, kind material), in its sort order.
// Core decides what is listed: members who cannot read drafts get only what
// has a published version, and archived material only to those who read
// drafts and ask for it.
//
// Whoever writes material may drop files anywhere on the page: the dialog for
// new material opens with them, one material for each.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { DocumentSummary } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { usePageDrop } from '@/composables/useFileDrop'
import { useCourseStore } from '@/stores/course'
import StatusTag from '@/components/StatusTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import TimeText from '@/components/TimeText.vue'
import MaterialCreateDialog from './components/MaterialCreateDialog.vue'
import PendingAlert from './components/PendingAlert.vue'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()

const readsDrafts = computed(() => course.can('document_read_draft'))
const canWrite = computed(() => course.can('document_write'))
const includeArchived = ref(false)

const list = usePaged<DocumentSummary>(
  (after) =>
    read('document.list', {
      course_id: props.courseId,
      kind: 'material',
      include_archived: includeArchived.value || undefined,
      limit: 100,
      after,
    }).then((o) => ({ items: o.documents, next: o.next })),
  { watch: [includeArchived] },
)

// Core pages by id; the order to read in is the instructor's sort order.
const sorted = computed(() =>
  [...list.items.value].sort(
    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title) || a.created_at.localeCompare(b.created_at),
  ),
)
const nextOrder = computed(() =>
  list.items.value.length ? Math.max(...list.items.value.map((d) => d.sort_order)) + 1 : 1,
)

const creating = ref(false)
const pendingNote = ref<string | null>(null)

// Files dropped on the page: new material, one for each.
const dropped = ref<File[]>([])
const takesFiles = computed(() => canWrite.value && course.writable)
function openCreate(files: File[] = []) {
  dropped.value = files
  creating.value = true
}
const pageDrop = usePageDrop({
  enabled: () => takesFiles.value && !creating.value,
  onFiles: (files) => {
    if (files.length) openCreate(files)
  },
})

function onCreated() {
  pendingNote.value = null
  void list.reload()
}
function onProposed(info: { titles: string[]; publish: boolean }) {
  const lines = [
    info.titles.length === 1
      ? t('materials.pending.create', { title: info.titles[0] })
      : t('materials.pending.createMany', { n: info.titles.length }),
  ]
  if (info.publish) lines.push(t('materials.pending.createPublish'))
  pendingNote.value = lines.join(' ')
  void list.reload()
}
</script>

<template>
  <div class="materials" :class="{ 'is-drop-target': pageDrop.dragging.value }">
    <PageHeader
      :title="t('materials.title')"
      :subtitle="readsDrafts ? t('materials.hintDrafts') : t('materials.hintReader')"
    >
      <el-checkbox v-if="readsDrafts" v-model="includeArchived" :label="t('materials.includeArchived')" border />
      <div v-if="canWrite" class="materials__create">
        <el-button type="primary" :disabled="!course.writable" @click="openCreate()">
          <el-icon><Plus /></el-icon>
          <span>{{ t('materials.newMaterial') }}</span>
        </el-button>
        <StatusTag
          v-if="course.needsApproval('document_write')"
          vocab="level"
          value="confirm_required"
          size="default"
        />
      </div>
    </PageHeader>

    <PendingAlert v-if="pendingNote" :course-id="courseId" :message="pendingNote" @close="pendingNote = null" />

    <section class="app-card materials__card">
      <!-- Where files dragged over the page will go. -->
      <div v-if="pageDrop.dragging.value" class="materials__drop" aria-hidden="true">
        <el-icon class="materials__drop-icon"><UploadFilled /></el-icon>
        <span>{{ t('materials.dropHere') }}</span>
      </div>
      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!list.items.value.length"
        :empty-text="readsDrafts ? t('materials.emptyDrafts') : t('materials.empty')"
        @retry="list.reload"
      >
        <template #empty>
          <el-button v-if="takesFiles" type="primary" plain @click="openCreate()">
            <el-icon><Plus /></el-icon>
            <span>{{ t('materials.newMaterial') }}</span>
          </el-button>
          <p v-if="takesFiles" class="materials__drop-hint">{{ t('materials.dropHint') }}</p>
        </template>
        <ul class="material-list">
          <li v-for="d in sorted" :key="d.id">
            <router-link
              :to="{ name: 'course-document', params: { courseId, documentId: d.id } }"
              class="material-row"
              :class="{ 'is-archived': d.status === 'archived' }"
            >
              <el-tooltip :content="t('materials.sortOrder')" placement="top">
                <span class="material-row__order">{{ d.sort_order }}</span>
              </el-tooltip>
              <div class="material-row__main">
                <span class="material-row__title">{{ d.title }}</span>
                <span class="material-row__meta">
                  {{ t('materials.added') }}
                  <TimeText :value="d.created_at" relative />
                </span>
              </div>
              <div class="material-row__tags">
                <el-tag v-if="d.purged_at" type="danger" size="small" disable-transitions>
                  {{ t('materials.purged') }}
                </el-tag>
                <el-tag v-else-if="d.status === 'archived'" type="info" size="small" disable-transitions>
                  {{ t('enums.documentStatus.archived') }}
                </el-tag>
                <!-- Only those who read drafts see anything that is not published. -->
                <el-tag
                  v-else-if="d.published_version_id && readsDrafts"
                  type="success"
                  size="small"
                  disable-transitions
                >
                  {{ t('materials.published') }}
                </el-tag>
                <el-tag v-else-if="!d.published_version_id" type="warning" size="small" disable-transitions>
                  {{ t('materials.unpublished') }}
                </el-tag>
              </div>
              <el-icon class="material-row__chevron"><ArrowRight /></el-icon>
            </router-link>
          </li>
        </ul>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
        <p v-if="takesFiles" class="materials__drop-hint">{{ t('materials.dropHint') }}</p>
      </AsyncState>
    </section>

    <MaterialCreateDialog
      v-if="canWrite"
      v-model="creating"
      :course-id="courseId"
      :suggested-order="nextOrder"
      :files="dropped"
      @created="onCreated"
      @proposed="onProposed"
    />
  </div>
</template>

<style scoped>
.materials__create {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.materials__card {
  padding: 8px;
  position: relative;
}
/* Files dragged over the page: the list is where they go. */
.materials__drop {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 160px;
  border: 2px dashed var(--el-color-primary);
  border-radius: inherit;
  background: color-mix(in srgb, var(--app-indigo-tint) 88%, transparent);
  color: var(--el-color-primary);
  font-size: var(--app-text-lg);
  font-weight: 500;
  pointer-events: none;
}
.materials__drop-icon {
  font-size: var(--app-text-3xl);
}
.is-drop-target .materials__card {
  min-height: 176px;
}
.materials__drop-hint {
  margin: 8px 12px 4px;
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
}
/* Nothing is dragged on a phone. */
@media (max-width: 640px), (hover: none) and (pointer: coarse) {
  .materials__drop-hint {
    display: none;
  }
}
.material-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.material-list li + li {
  border-top: 1px solid var(--el-border-color-lighter);
}
.material-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--app-radius-item);
  color: inherit;
  text-decoration: none;
  min-width: 0;
}
.material-row:hover {
  background: var(--el-fill-color-light);
}
.material-row.is-archived .material-row__title {
  color: var(--el-text-color-secondary);
}
.material-row__order {
  flex-shrink: 0;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-radius-control);
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: var(--app-text-xs);
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
.material-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.material-row__title {
  font-size: var(--app-text-lg);
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.material-row__meta {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.material-row__tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.material-row__chevron {
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}
@media (max-width: 480px) {
  .material-row {
    gap: 8px;
    padding: 10px 6px;
  }
  .material-row__chevron {
    display: none;
  }
}
</style>
