<script setup lang="ts">
// The rubric beside the grading form, and a word on what the grade will
// record of it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import DocumentFileLink from '@/components/DocumentFileLink.vue'
import MarkdownView from '@/components/MarkdownView.vue'
import type { RubricState } from './rubric'

const props = defineProps<{ courseId: string; state?: RubricState; loading?: boolean; error?: ApiError | null }>()
const { t } = useI18n()

const doc = computed(() =>
  props.state?.status === 'published' || props.state?.status === 'unpublished' ? props.state.doc : null,
)
const version = computed(() => doc.value?.version ?? null)
const hasFile = computed(() => !!version.value && (!!version.value.download_url || !!version.value.content_type))

const note = computed(() => {
  if (props.error) return t('submissions.rubric.unavailable')
  switch (props.state?.status) {
    case 'unknown':
      return t('submissions.rubric.unknown')
    case 'none':
      return t('submissions.rubric.none')
    case 'hidden':
      return t('submissions.rubric.hidden')
    case 'unpublished':
      return version.value ? t('submissions.rubric.unpublishedDraft') : t('submissions.rubric.unpublished')
    case 'published':
      return t('submissions.rubric.recorded')
  }
  return ''
})
</script>

<template>
  <div class="rubric-panel" v-loading="loading">
    <div class="rubric-panel__head">
      <span class="rubric-panel__title">
        <el-icon><Memo /></el-icon>
        {{ doc?.title ?? t('submissions.rubric.title') }}
      </span>
      <el-tag v-if="version" size="small" :type="version.published ? 'success' : 'warning'" disable-transitions>
        {{ t('submissions.rubric.version', { n: version.seq }) }}
      </el-tag>
    </div>
    <p v-if="note" class="rubric-panel__note" :class="{ 'is-warning': state?.status === 'unpublished' || !!error }">
      {{ note }}
    </p>
    <template v-if="version">
      <div class="rubric-panel__body">
        <MarkdownView
          v-if="version.body_md || !hasFile"
          :source="version.body_md"
          :empty="t('submissions.rubric.emptyBody')"
        />
      </div>
      <DocumentFileLink
        v-if="hasFile && doc"
        :course-id="courseId"
        :document-id="doc.id"
        :version-id="version.id"
        :title="t('submissions.rubric.file')"
      />
    </template>
  </div>
</template>

<style scoped>
.rubric-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
}
.rubric-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.rubric-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  word-break: break-word;
}
.rubric-panel__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.rubric-panel__note.is-warning {
  color: var(--el-color-warning);
}
.rubric-panel__body {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.rubric-panel__body :deep(.markdown-body) {
  font-size: 14px;
}
.rubric-panel__body :deep(.markdown-body h1),
.rubric-panel__body :deep(.markdown-body h2) {
  font-size: 1.1em;
  border-bottom: none;
  padding-bottom: 0;
}
.rubric-panel__body :deep(.markdown-body h3),
.rubric-panel__body :deep(.markdown-body h4) {
  font-size: 1em;
}
</style>
