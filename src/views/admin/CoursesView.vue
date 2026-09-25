<script setup lang="ts">
// Every course on the platform (course.list), by term and department, and
// creating one (course.create).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { read } from '@/api/http'
import type { Department, Term } from '@/api/types'
import { useAsync, usePaged } from '@/composables/useAsync'
import { errorMessage } from '@/composables/useErrors'
import { useNarrow } from '@/composables/useMediaQuery'
import AsyncState from '@/components/AsyncState.vue'
import LoadMore from '@/components/LoadMore.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import CreateCourseDialog from './components/CreateCourseDialog.vue'
import type { CourseRow } from './components/adminShared'

const { t } = useI18n()
const route = useRoute()
const narrow = useNarrow()
const router = useRouter()

// The filters live in the address, so that coming back to the list keeps them.
function queryParam(name: string) {
  return computed<string | undefined>({
    get: () => (typeof route.query[name] === 'string' && route.query[name] ? (route.query[name] as string) : undefined),
    set: (v) => void router.replace({ query: { ...route.query, [name]: v || undefined } }),
  })
}
const termId = queryParam('term')
const deptId = queryParam('dept')

const termsState = useAsync(() => read('term.list', {}).then((o) => o.terms ?? []))
const deptsState = useAsync(() => read('department.list', {}).then((o) => o.departments ?? []))
const terms = computed<Term[]>(() => termsState.data.value ?? [])
const departments = computed<Department[]>(() => deptsState.data.value ?? [])
const termById = computed(() => new Map(terms.value.map((x) => [x.id, x])))
const deptById = computed(() => new Map(departments.value.map((x) => [x.id, x])))

const setupLoaded = computed(() => termsState.data.value !== undefined && deptsState.data.value !== undefined)
const missingTerms = computed(() => termsState.data.value !== undefined && terms.value.length === 0)
const missingDepts = computed(() => deptsState.data.value !== undefined && departments.value.length === 0)
const canCreate = computed(() => setupLoaded.value && !missingTerms.value && !missingDepts.value)
/** Terms or departments did not load: no course can be made, and none shows its term or department. */
const setupError = computed(() => termsState.error.value ?? deptsState.error.value)
const setupFailed = computed(() =>
  termsState.error.value && deptsState.error.value ? 'both' : termsState.error.value ? 'terms' : 'depts',
)
const setupRetrying = computed(() => termsState.loading.value || deptsState.loading.value)
function reloadSetup() {
  if (termsState.error.value) void termsState.reload()
  if (deptsState.error.value) void deptsState.reload()
}

const list = usePaged<CourseRow>(
  (after) =>
    read('course.list', { term_id: termId.value, dept_id: deptId.value, limit: 50, after }).then((o) => ({
      items: o.courses,
      next: o.next,
    })),
  { watch: [termId, deptId] },
)
const filtered = computed(() => !!termId.value || !!deptId.value)

const creating = ref(false)
function onCreated(courseId: string) {
  router.push({ name: 'admin-course', params: { courseId } })
}

function rowClick(row: CourseRow) {
  router.push({ name: 'admin-course', params: { courseId: row.id } })
}
</script>

<template>
  <div>
    <PageHeader :title="t('admin.courses.title')" :subtitle="t('admin.courses.subtitle')">
      <el-button type="primary" :disabled="!canCreate" @click="creating = true">
        <el-icon><Plus /></el-icon>
        <span>{{ t('admin.courses.create') }}</span>
      </el-button>
    </PageHeader>

    <el-alert
      v-if="setupError"
      type="error"
      show-icon
      :closable="false"
      class="courses__setup"
      :title="t(`admin.courses.setupFailed.${setupFailed}`)"
    >
      <div class="courses__setup-error">
        <span>{{ errorMessage(setupError) }}</span>
        <el-button size="small" :loading="setupRetrying" @click="reloadSetup">{{ t('common.actions.retry') }}</el-button>
      </div>
    </el-alert>

    <el-alert
      v-if="missingTerms || missingDepts"
      type="warning"
      show-icon
      :closable="false"
      class="courses__setup"
      :title="t('admin.courses.needSetup')"
    >
      <div class="courses__setup-links">
        <span v-if="missingTerms">
          {{ t('admin.courses.noTerms') }}
          <router-link :to="{ name: 'admin-terms' }">{{ t('admin.courses.goTerms') }}</router-link>
        </span>
        <span v-if="missingDepts">
          {{ t('admin.courses.noDepts') }}
          <router-link :to="{ name: 'admin-departments' }">{{ t('admin.courses.goDepts') }}</router-link>
        </span>
      </div>
    </el-alert>

    <div class="app-card">
      <div class="app-toolbar">
        <el-select
          v-model="termId"
          clearable
          filterable
          :placeholder="t('admin.courses.allTerms')"
          :loading="termsState.loading.value"
          class="courses__filter"
          :aria-label="t('admin.courses.term')"
        >
          <el-option v-for="x in terms" :key="x.id" :value="x.id" :label="x.name">
            <span>{{ x.name }}</span>
            <span class="courses__option-meta">{{ t('admin.courses.termDates', { from: x.starts_on, to: x.ends_on }) }}</span>
          </el-option>
        </el-select>
        <el-select
          v-model="deptId"
          clearable
          filterable
          :placeholder="t('admin.courses.allDepts')"
          :loading="deptsState.loading.value"
          class="courses__filter"
          :aria-label="t('admin.courses.dept')"
        >
          <el-option v-for="x in departments" :key="x.id" :value="x.id" :label="x.name" />
        </el-select>
        <span class="app-toolbar__spacer" />
        <el-button :loading="list.loading.value" @click="list.reload()">
          <el-icon><Refresh /></el-icon>
          <span>{{ t('common.actions.refresh') }}</span>
        </el-button>
      </div>

      <AsyncState
        :loading="list.loading.value && !list.items.value.length"
        :error="list.error.value"
        :empty="!list.items.value.length"
        :empty-text="filtered ? t('admin.courses.emptyFiltered') : t('admin.courses.empty')"
        @retry="list.reload"
      >
        <template #empty>
          <el-button v-if="!filtered && canCreate" type="primary" @click="creating = true">
            {{ t('admin.courses.create') }}
          </el-button>
        </template>
        <el-table :data="list.items.value" row-key="id" class="courses__table" @row-click="rowClick">
          <el-table-column :label="t('admin.courses.col.course')" :min-width="narrow ? 200 : 240">
            <template #default="{ row }">
              <div class="courses__course">
                <span class="courses__code">{{ row.code }}<template v-if="row.section"> · {{ row.section }}</template></span>
                <span class="courses__title">{{ row.title }}</span>
                <span v-if="narrow" class="courses__meta">
                  {{ termById.get(row.term_id)?.name ?? t('admin.courses.unknown') }}
                  · {{ deptById.get(row.dept_id)?.name ?? t('admin.courses.unknown') }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('admin.courses.col.status')" width="110">
            <template #default="{ row }">
              <StatusTag vocab="courseStatus" :value="row.status" />
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.courses.col.term')" min-width="150">
            <template #default="{ row }">
              <span v-if="termById.get(row.term_id)">{{ termById.get(row.term_id)!.name }}</span>
              <span v-else class="app-muted">{{ t('admin.courses.unknown') }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.courses.col.dept')" min-width="150">
            <template #default="{ row }">
              <span v-if="deptById.get(row.dept_id)">{{ deptById.get(row.dept_id)!.name }}</span>
              <span v-else class="app-muted">{{ t('admin.courses.unknown') }}</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('admin.courses.col.created')" min-width="150">
            <template #default="{ row }">
              <TimeText :value="row.created_at" />
            </template>
          </el-table-column>
        </el-table>
        <LoadMore :has-more="list.hasMore.value" :loading="list.loading.value" @more="list.loadMore" />
      </AsyncState>
    </div>

    <CreateCourseDialog
      v-model="creating"
      :terms="terms"
      :departments="departments"
      :term-id="termId"
      :dept-id="deptId"
      @created="onCreated"
    />
  </div>
</template>

<style scoped>
.courses__setup {
  margin-bottom: 16px;
}
.courses__setup-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.courses__setup-error {
  display: flex;
  align-items: center;
  gap: 8px 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.courses__filter {
  width: 220px;
  max-width: 100%;
}
.courses__option-meta {
  float: right;
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.courses__table :deep(.el-table__row) {
  cursor: pointer;
}
.courses__course {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.courses__code {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.courses__title {
  font-weight: 500;
  word-break: break-word;
}
.courses__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
@media (max-width: 600px) {
  .courses__filter {
    width: 100%;
  }
}
</style>
