<script setup lang="ts">
// Every version of a document (document.versions), newest first: which one is
// published, which is the latest, which is on screen, which was purged, how
// many files it holds and their names (or that it is text alone), and a way
// to look at or publish any of them; for an administrator, to purge one.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { ApiError } from '@/api/http'
import type { DocumentVersion } from '@/api/types'
import { useCourseStore } from '@/stores/course'
import { versionFilesOf } from '@/utils/documentFiles'
import { formatBytes } from '@/utils/format'
import AsyncState from '@/components/AsyncState.vue'
import MemberName from '@/components/MemberName.vue'
import TimeText from '@/components/TimeText.vue'

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
  /** Offer purging a version (the caller administers the course). */
  canPurge?: boolean
}>()
const emit = defineEmits<{ publish: [version: DocumentVersion]; purge: [version: DocumentVersion]; retry: [] }>()
const { t } = useI18n()
const course = useCourseStore()
const route = useRoute()

const ordered = computed(() => [...props.versions].sort((a, b) => b.seq - a.seq))

/** The most files named under a version; the rest are counted. */
const NAMED = 3
const filesOf = (v: DocumentVersion) => versionFilesOf(v)
const totalOf = (v: DocumentVersion) => filesOf(v).reduce((sum, f) => sum + f.byte_size, 0)

function linkTo(v: DocumentVersion) {
  const params = { courseId: props.courseId, documentId: props.documentId }
  // The tab shown (the text version's) stays shown for the other version.
  const tab = typeof route.query.tab === 'string' ? route.query.tab : undefined
  // The latest is what the page shows by default: link to it without naming it.
  return v.id === props.latestId
    ? { name: 'course-document', params, query: tab ? { tab } : {} }
    : { name: 'course-document', params, query: { version: v.id, ...(tab ? { tab } : {}) } }
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
          <el-tag v-if="v.purged_at" type="danger" size="small" effect="dark" disable-transitions>
            {{ t('materials.document.tombstone.tag') }}
          </el-tag>
        </div>
        <div class="version-item__meta">
          <!-- Names come from the member list; without it only one's own name is known. -->
          <template v-if="course.can('member_read') || v.author_member_id === course.myMemberId">
            <MemberName :id="v.author_member_id" show-kind />
            <span class="version-item__dot">·</span>
          </template>
          <TimeText :value="v.created_at" relative />
        </div>
        <div v-if="v.purged_at" class="version-item__meta version-item__purged">
          <el-icon><Delete /></el-icon>
          <span>{{ t('materials.document.tombstone.gone') }}</span>
          <TimeText :value="v.purged_at" relative />
        </div>
        <template v-else>
          <div class="version-item__meta">
            <template v-if="filesOf(v).length">
              <el-icon><Paperclip /></el-icon>
              <span class="version-item__count">{{
                t('common.files.count', { n: filesOf(v).length }, filesOf(v).length)
              }}</span>
              <span class="version-item__dot">·</span>
              <span>{{ formatBytes(totalOf(v)) }}</span>
            </template>
            <template v-else>
              <el-icon><Document /></el-icon>
              <span>{{ t('common.files.textOnly') }}</span>
            </template>
          </div>
          <ul v-if="filesOf(v).length" class="version-item__files">
            <li v-for="f in filesOf(v).slice(0, NAMED)" :key="f.id" class="version-item__file" :title="f.filename">
              {{ f.filename }}
            </li>
            <li v-if="filesOf(v).length > NAMED" class="version-item__more">
              {{ t('materials.document.versions.more', { n: filesOf(v).length - NAMED }) }}
            </li>
          </ul>
        </template>
        <div class="version-item__actions">
          <span v-if="v.id === shownId" class="version-item__showing">
            <el-icon><View /></el-icon>{{ t('materials.document.versions.showing') }}
          </span>
          <router-link v-else :to="linkTo(v)" class="version-item__link">
            {{ t('materials.document.versions.view') }}
          </router-link>
          <el-button v-if="canPurge && !v.purged_at" link type="danger" size="small" @click="emit('purge', v)">
            <el-icon><Delete /></el-icon>
            <span>{{ t('materials.document.purge.version') }}</span>
          </el-button>
          <el-button
            v-if="canPublish && !v.published && !v.purged_at"
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
.version-item__purged {
  color: var(--el-color-danger);
}
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
  border-radius: var(--app-radius-item);
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
  font-weight: var(--app-weight-strong);
  font-variant-numeric: tabular-nums;
}
.version-item__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
  min-width: 0;
}
.version-item__files {
  list-style: none;
  margin: 0;
  padding: 0 0 0 18px;
  display: flex;
  flex-direction: column;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  color: var(--app-ink-2);
  min-width: 0;
}
.version-item__file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version-item__more {
  color: var(--el-text-color-secondary);
}
.version-item__dot {
  color: var(--el-text-color-placeholder);
}
.version-item__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: var(--app-text-sm);
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
