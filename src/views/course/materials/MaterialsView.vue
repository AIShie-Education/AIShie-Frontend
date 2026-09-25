<script setup lang="ts">
// The course's material (document.list, kind material), in its sort order.
// Core decides what is listed: members who cannot read drafts get only what
// has a published version, and archived material only to those who read
// drafts and ask for it.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { DocumentSummary } from '@/api/types'
import { usePaged } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
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

function onCreated() {
  pendingNote.value = null
  void list.reload()
}
function onProposed(info: { title: string; publish: boolean }) {
  const lines = [t('materials.pending.create', { title: info.title })]
  if (info.publish) lines.push(t('materials.pending.createPublish'))
  pendingNote.value = lines.join(' ')
  void list.reload()
}
</script>

<template>
  <div class="materials">
    <PageHeader
      :title="t('materials.title')"
      :subtitle="readsDrafts ? t('materials.hintDrafts') : t('materials.hintReader')"
    >
      <el-checkbox v-if="readsDrafts" v-model="includeArchived" :label="t('materials.includeArchived')" border />
      <div v-if="canWrite" class="materials__create">
        <el-button type="primary" :disabled="!course.writable" @click="creating = true">
          <el-icon><Plus /></el-icon>
          <span>{{ t('materials.newMaterial') }}</span>
        </el-button>
        <el-tag v-if="course.needsApproval('document_write')" type="warning" disable-transitions>
          {{ t('enums.level.confirm_required') }}
        </el-tag>
      </div>
    </PageHeader>

    <PendingAlert v-if="pendingNote" :course-id="courseId" :message="pendingNote" @close="pendingNote = null" />

    <section class="app-card materials__card">
      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!list.items.value.length"
        :empty-text="readsDrafts ? t('materials.emptyDrafts') : t('materials.empty')"
        @retry="list.reload"
      >
        <template #empty>
          <el-button v-if="canWrite && course.writable" type="primary" plain @click="creating = true">
            <el-icon><Plus /></el-icon>
            <span>{{ t('materials.newMaterial') }}</span>
          </el-button>
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
                <el-tag v-if="d.status === 'archived'" type="info" size="small" disable-transitions>
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
      </AsyncState>
    </section>

    <MaterialCreateDialog
      v-if="canWrite"
      v-model="creating"
      :course-id="courseId"
      :suggested-order="nextOrder"
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
  border-radius: 8px;
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
  border-radius: 6px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
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
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.material-row__meta {
  font-size: 12px;
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
