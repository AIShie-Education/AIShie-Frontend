<script setup lang="ts">
// Choosing the course whose conversations are exported: the courses the
// caller administers (course.list: every course for a platform
// administrator, those of their departments and beneath them for a
// department's administrator), found by a piece of their code, section,
// title or term as it is typed, or by a pasted course ID. Each says its term,
// since a course's code and section come again term after term. course.list
// has no search of its own, so its pages are read once, up to COURSES_MAX,
// and searched here; a course past them is found by its ID.
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { errorMessage } from '@/composables/useErrors'
import { isUuid, shortId } from '@/utils/format'
import StatusTag from '@/components/StatusTag.vue'
import { findCourse, type CourseRow } from '../components/adminShared'

const model = defineModel<string>({ required: true })
/** The chosen course in words (its code, section and title), for what the page says of the export. */
const label = defineModel<string>('label', { default: '' })
defineProps<{ id?: string; disabled?: boolean }>()
const { t } = useI18n()
const tree = useDepartmentTree()

/** How many courses are read to choose from, at most; past them a course is found by its ID. */
const COURSES_MAX = 2000
/** How many matches are shown at once: typing more narrows them. */
const SHOWN_MAX = 100

const loaded = useAsync(async () => {
  const courses: CourseRow[] = []
  let after: string | undefined
  do {
    const page = await read('course.list', { limit: 200, after })
    courses.push(...(page.courses ?? []))
    after = page.next ?? undefined
  } while (after && courses.length < COURSES_MAX)
  return { courses, more: !!after }
})

const terms = useAsync(() => read('term.list', {}).then((o) => new Map((o.terms ?? []).map((x) => [x.id, x.name]))))
const termName = (c: CourseRow) => terms.data.value?.get(c.term_id) ?? ''

const query = ref('')
/** A course found by its pasted ID, past those read. */
const byId = shallowRef<CourseRow | null>(null)
const finding = ref(false)
const findError = ref<string | null>(null)

const all = computed<CourseRow[]>(() => {
  const list = loaded.data.value?.courses ?? []
  const extra = byId.value
  return extra && !list.some((c) => c.id === extra.id) ? [extra, ...list] : list
})

/** The course in words: its code, section and title, and its term where it is known. */
const words = (c: CourseRow) => {
  const term = termName(c)
  return `${c.code}${c.section ? ` · ${c.section}` : ''} ${c.title}${term ? ` (${term})` : ''}`
}

/** Those that hold what is typed, by code and section, the newest first among the same. */
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? all.value.filter((c) => `${c.code} ${c.section} ${c.title} ${termName(c)} ${c.id}`.toLowerCase().includes(q))
    : all.value
  return [...list].sort(
    (a, b) =>
      `${a.code} ${a.section}`.localeCompare(`${b.code} ${b.section}`) || b.created_at.localeCompare(a.created_at),
  )
})
const options = computed(() => {
  const shown = matches.value.slice(0, SHOWN_MAX)
  // The one chosen stays among the options, so that the box keeps showing it.
  const chosen = all.value.find((c) => c.id === model.value)
  if (chosen && !shown.includes(chosen)) shown.unshift(chosen)
  return shown
})
const cut = computed(() => matches.value.length > SHOWN_MAX)

let finds = 0
async function filter(text: string) {
  query.value = text
  findError.value = null
  const id = text.trim().toLowerCase()
  if (!isUuid(id) || all.value.some((c) => c.id === id)) return
  const mine = ++finds
  finding.value = true
  try {
    const c = await findCourse(id, t('auditExport.course.notFound'))
    if (mine === finds) byId.value = c
  } catch (e) {
    if (mine === finds) findError.value = errorMessage(e)
  } finally {
    if (mine === finds) finding.value = false
  }
}

function pick(id: string | undefined) {
  model.value = id ?? ''
  const c = all.value.find((x) => x.id === id)
  label.value = c ? words(c) : ''
  query.value = ''
}

// The words follow what is known of the course chosen: its term may be read after it was chosen.
watch(
  () => {
    const c = model.value ? all.value.find((x) => x.id === model.value) : undefined
    return c ? words(c) : null
  },
  (w) => {
    if (w) label.value = w
  },
)

const deptName = (id: string) => tree.byId.value.get(id)?.name
</script>

<template>
  <div class="course-picker">
    <el-select
      :id="id"
      :model-value="model || undefined"
      filterable
      clearable
      fit-input-width
      :filter-method="filter"
      :loading="loaded.loading.value || finding"
      :disabled="disabled"
      :placeholder="t('auditExport.course.placeholder')"
      class="course-picker__select"
      popper-class="course-picker__popper"
      @update:model-value="pick"
      @visible-change="(open: boolean) => !open && (query = '')"
    >
      <el-option v-for="c in options" :key="c.id" :value="c.id" :label="words(c)">
        <div class="course-picker__option">
          <span class="course-picker__name">
            <span class="course-picker__code">{{ c.code }}{{ c.section ? ` · ${c.section}` : '' }}</span>
            <span class="course-picker__title">{{ c.title }}</span>
          </span>
          <span class="course-picker__meta">
            <StatusTag v-if="c.status !== 'active'" vocab="courseStatus" :value="c.status" />
            <span v-if="termName(c)" class="course-picker__term">{{ termName(c) }}</span>
            <span v-if="deptName(c.dept_id)">{{ deptName(c.dept_id) }}</span>
            <code class="app-mono course-picker__id">{{ shortId(c.id) }}</code>
          </span>
        </div>
      </el-option>
      <template #empty>
        <div class="course-picker__empty">
          <template v-if="loaded.loading.value || finding">{{ t('common.labels.loading') }}</template>
          <template v-else-if="loaded.error.value">{{ errorMessage(loaded.error.value) }}</template>
          <template v-else-if="findError">{{ findError }}</template>
          <template v-else-if="!all.length">{{ t('auditExport.course.none') }}</template>
          <template v-else>{{ t('auditExport.course.noMatch') }}</template>
        </div>
      </template>
      <template v-if="cut || loaded.data.value?.more" #footer>
        <div class="course-picker__more">
          {{
            cut
              ? t('auditExport.course.typeMore', { n: SHOWN_MAX })
              : t('auditExport.course.pasteId', { n: COURSES_MAX })
          }}
        </div>
      </template>
    </el-select>
    <div v-if="loaded.error.value" class="course-picker__error" role="alert">
      <span>{{ errorMessage(loaded.error.value) }}</span>
      <el-button size="small" link type="primary" @click="loaded.reload()">{{ t('common.actions.retry') }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.course-picker,
.course-picker__select {
  width: 100%;
}
.course-picker__option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.course-picker__name {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.course-picker__code {
  font-weight: 600;
  flex: none;
}
.course-picker__title {
  overflow: hidden;
  text-overflow: ellipsis;
}
.course-picker__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  max-width: 45%;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.course-picker__id {
  font-size: 11px;
}
.course-picker__empty,
.course-picker__more {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.course-picker__more {
  padding: 0;
  font-size: 12px;
}
.course-picker__error {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--el-color-danger);
}
@media (max-width: 640px) {
  .course-picker__meta {
    display: none;
  }
}
</style>
