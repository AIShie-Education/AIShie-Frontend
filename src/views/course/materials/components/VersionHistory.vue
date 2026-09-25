<script setup lang="ts">
// Every version of a document (document.versions), newest first: which one is
// published, which is the latest, which is on screen, and a way to look at
// or publish any of them.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ApiError } from '@/api/http'
import type { DocumentVersion } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { formatBytes } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import TimeText from '@/components/TimeText.vue'
import AuthorName from './AuthorName.vue'

const props = defineProps<{
  courseId: string
  documentId: string
  versions: DocumentVersion[]
  loading: boolean
  error: ApiError | null
  shownId: string | null
  latestId: string | null
  /** Offer publishing (the seat may write this document, and it is active). */
  canPublish: boolean
  publishDisabled: boolean
}>()
const emit = defineEmits<{ publish: [version: DocumentVersion]; retry: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const readsMembers = computed(() => course.can('member_read'))

const ordered = computed(() => [...props.versions].sort((a, b) => b.seq - a.seq))

function linkTo(v: DocumentVersion) {
  const params = { courseId: props.courseId, documentId: props.documentId }
  // The latest is what the page shows by default: link to it without naming it.
  return v.id === props.latestId
    ? { name: 'course-document', params }
    : { name: 'course-document', params, query: { version: v.id } }
}
</script>

<template>
  <AsyncState
    :loading="loading && !versions.length"
    :error="error"
    :empty="!versions.length"
    :empty-text="t('materials.document.versions.empty')"
    @retry="emit('retry')"
  >
    <ol class="version-list">
      <li v-for="v in ordered" :key="v.id" class="version-item" :class="{ 'is-shown': v.id === shownId }">
        <div class="version-item__head">
          <span class="version-item__seq">{{ t('materials.document.versionShort', { seq: v.seq }) }}</span>
          <el-tag v-if="v.published" type="success" size="small" disable-transitions>
            {{ t('materials.document.published') }}
          </el-tag>
          <el-tag v-if="v.id === latestId" size="small" effect="plain" disable-transitions>
            {{ t('materials.document.latest') }}
          </el-tag>
        </div>
        <div class="version-item__meta">
          <template v-if="readsMembers || v.author_member_id === course.myMemberId">
            <AuthorName :id="v.author_member_id" />
            <span class="version-item__dot">·</span>
          </template>
          <TimeText :value="v.created_at" relative />
        </div>
        <div class="version-item__meta">
          <template v-if="v.has_file">
            <el-icon><Paperclip /></el-icon>
            <span class="version-item__file">{{ v.content_type ?? t('materials.document.file') }}</span>
            <span class="version-item__dot">·</span>
            <span>{{ formatBytes(v.byte_size) }}</span>
          </template>
          <template v-else>
            <el-icon><Document /></el-icon>
            <span>{{ t('materials.document.versions.text') }}</span>
          </template>
        </div>
        <div class="version-item__actions">
          <span v-if="v.id === shownId" class="version-item__showing">
            <el-icon><View /></el-icon>{{ t('materials.document.versions.showing') }}
          </span>
          <router-link v-else :to="linkTo(v)" class="version-item__link">
            {{ t('materials.document.versions.view') }}
          </router-link>
          <el-button
            v-if="canPublish && !v.published"
            link
            type="primary"
            size="small"
            :disabled="publishDisabled"
            @click="emit('publish', v)"
          >
            <el-icon><Promotion /></el-icon>
            <span>{{ t('materials.document.versions.publish') }}</span>
          </el-button>
        </div>
      </li>
    </ol>
  </AsyncState>
</template>

<style scoped>
.version-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.version-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.version-item.is-shown {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.version-item__head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.version-item__seq {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.version-item__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 0;
}
.version-item__file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.version-item__dot {
  color: var(--el-text-color-placeholder);
}
.version-item__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  margin-top: 2px;
}
.version-item__showing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--el-color-primary);
  font-weight: 500;
}
.version-item__link {
  text-decoration: none;
}
.version-item__link:hover {
  text-decoration: underline;
}
</style>
