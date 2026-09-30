<script setup lang="ts">
// What the transcriber did (GET admin/transcription/jobs, kept 90 days by
// the runtime), newest first, a page at a time, of one status or all: each
// version it took up, how that ended (done, failed, skipped, dropped because
// staff wrote the text or the claim was lost, or still working), why in the
// reader's words, its pages and cost. The runtime reads no titles: a
// document's is asked of Core where the administrator may read it
// (document.get, once per document on the page), and it links to the
// version's text version either way.
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { runtimeAdmin } from '@/api/runtime'
import type { TranscriptionJob, TranscriptionJobFilter } from '@/api/runtime-types'
import { useNarrow } from '@/composables/useMediaQuery'
import { shortId } from '@/utils/format'
import LoadMore from '@/components/LoadMore.vue'
import TimeText from '@/components/TimeText.vue'
import { textReasonText } from '@/views/course/materials/components/textVersion'
import RuntimeAsync from './RuntimeAsync.vue'
import { usdShown } from './runtimeAdmin'
import { JOB_STATUS_TAG } from './transcription'

const { t, te, n } = useI18n()
const narrow = useNarrow()

/** 'all', or a status the runtime lists by. */
const FILTERS: ('all' | TranscriptionJobFilter)[] = ['all', 'done', 'failed', 'skipped', 'working']
const PAGE = 20

const status = ref<'all' | TranscriptionJobFilter>('all')
const jobs = ref<TranscriptionJob[]>([])
const next = ref<string | null>(null)
const loading = ref(false)
const loaded = ref(false)
const error = shallowRef<unknown>(null)
let generation = 0

async function load(more = false) {
  if (loading.value && more) return
  const mine = ++generation
  loading.value = true
  error.value = null
  try {
    const r = await runtimeAdmin.transcriptionJobs({
      status: status.value === 'all' ? undefined : status.value,
      limit: PAGE,
      after: more && next.value ? next.value : undefined,
    })
    if (mine !== generation) return
    jobs.value = more ? [...jobs.value, ...(r.data.jobs ?? [])] : (r.data.jobs ?? [])
    next.value = r.data.next ?? null
    loaded.value = true
    void resolveTitles(r.data.jobs ?? [])
  } catch (e) {
    if (mine === generation) error.value = e
  } finally {
    if (mine === generation) loading.value = false
  }
}
void load()
watch(status, () => {
  loaded.value = false
  void load()
})

// --- Documents' titles --------------------------------------------------------------------
/** Titles asked of Core, once per document for the page's life; null where it cannot be read. */
const titleCache = new Map<string, Promise<string | null>>()
const titles = reactive(new Map<string, string | null>())
const docKey = (j: TranscriptionJob) => `${j.course_id}/${j.document_id}`

async function resolveTitles(page: TranscriptionJob[]) {
  for (const j of page) {
    const key = docKey(j)
    if (titleCache.has(key)) continue
    const p = read('document.get', { course_id: j.course_id, document_id: j.document_id }).then(
      (d) => d.title || null,
      () => null,
    )
    titleCache.set(key, p)
    void p.then((title) => titles.set(key, title))
  }
}

function linkTo(j: TranscriptionJob) {
  return {
    name: 'course-document',
    params: { courseId: j.course_id, documentId: j.document_id },
    query: { version: j.version_id, tab: 'text' },
  }
}

const reasonOf = (j: TranscriptionJob) => textReasonText(j.reason, t, te)
const costOf = (j: TranscriptionJob) =>
  j.cost_usd === null ? t('runtimeAdmin.transcription.jobs.unpriced') : `$${usdShown(j.cost_usd)}`
const empty = computed(() => loaded.value && !jobs.value.length)
</script>

<template>
  <div class="transcription-jobs">
    <div class="transcription-jobs__head">
      <h3 class="transcription-jobs__title">{{ t('runtimeAdmin.transcription.jobs.title') }}</h3>
      <el-select
        v-model="status"
        size="small"
        :aria-label="t('runtimeAdmin.transcription.jobs.filter')"
        class="transcription-jobs__filter"
      >
        <el-option
          v-for="f in FILTERS"
          :key="f"
          :value="f"
          :label="
            f === 'all' ? t('runtimeAdmin.transcription.jobs.all') : t(`runtimeAdmin.transcription.jobs.status.${f}`)
          "
        />
      </el-select>
      <el-button
        circle
        size="small"
        :loading="loading"
        :aria-label="t('common.actions.refresh')"
        class="transcription-jobs__refresh"
        @click="load()"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>
    <RuntimeAsync :loading="loading && !loaded" :error="loaded ? null : error" @retry="load()">
      <el-empty
        v-if="empty"
        :image-size="64"
        :description="t('runtimeAdmin.transcription.jobs.empty')"
        class="transcription-jobs__empty"
      />
      <el-table v-else :data="jobs" row-key="id" class="transcription-jobs__table">
        <el-table-column :label="t('runtimeAdmin.transcription.jobs.document')" min-width="220">
          <template #default="{ row }">
            <div class="job-cell" :data-job="row.id">
              <div class="job-cell__head">
                <el-tag
                  :type="JOB_STATUS_TAG[row.status as TranscriptionJob['status']] ?? 'info'"
                  size="small"
                  disable-transitions
                  class="job-cell__status"
                >
                  {{
                    te(`runtimeAdmin.transcription.jobs.status.${row.status}`)
                      ? t(`runtimeAdmin.transcription.jobs.status.${row.status}`)
                      : row.status
                  }}
                </el-tag>
                <router-link :to="linkTo(row)" class="job-cell__doc">
                  {{ titles.get(docKey(row)) || shortId(row.document_id) }}
                </router-link>
                <el-tag v-if="row.backfill" size="small" type="info" effect="plain" disable-transitions>
                  {{ t('runtimeAdmin.transcription.jobs.backfill') }}
                </el-tag>
              </div>
              <span v-if="reasonOf(row)" class="job-cell__reason">{{ reasonOf(row) }}</span>
              <span class="job-cell__meta">
                {{ row.content_type }}<template v-if="row.model"> · {{ row.model }}</template>
              </span>
              <span v-if="narrow" class="job-cell__meta">
                <template v-if="row.pages !== null">
                  {{ t('runtimeAdmin.transcription.jobs.pagesN', { n: n(row.pages) }, row.pages) }} ·
                </template>
                {{ costOf(row) }} ·
                <TimeText :value="row.finished_at ?? row.started_at" relative />
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          v-if="!narrow"
          :label="t('runtimeAdmin.transcription.jobs.pages')"
          min-width="80"
          align="right"
        >
          <template #default="{ row }">
            <span class="job-cell__num job-cell__pages">{{ row.pages === null ? '—' : n(row.pages) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!narrow" :label="t('runtimeAdmin.costs.cost')" min-width="100" align="right">
          <template #default="{ row }">
            <span class="job-cell__num job-cell__cost">{{ costOf(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!narrow" :label="t('runtimeAdmin.transcription.jobs.finished')" min-width="130">
          <template #default="{ row }">
            <TimeText v-if="row.finished_at" :value="row.finished_at" relative />
            <span v-else class="job-cell__meta">
              {{ t('runtimeAdmin.transcription.jobs.since') }} <TimeText :value="row.started_at" relative />
            </span>
          </template>
        </el-table-column>
      </el-table>
      <LoadMore :has-more="!!next" :loading="loading" @more="load(true)" />
    </RuntimeAsync>
  </div>
</template>

<style scoped>
.transcription-jobs {
  border-top: 1px solid var(--el-border-color-lighter);
}
.transcription-jobs__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 20px 0 10px;
}
.transcription-jobs__title {
  margin: 0 auto 0 0;
  font-size: 14px;
  font-weight: 600;
}
.transcription-jobs__filter {
  width: 140px;
}
.job-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  word-break: break-word;
}
.job-cell__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.job-cell__reason {
  font-size: 13px;
}
.job-cell__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.job-cell__num {
  font-variant-numeric: tabular-nums;
}
</style>
