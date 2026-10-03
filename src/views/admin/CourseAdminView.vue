<script setup lang="ts">
// One course as its administrators see it, from outside: its details
// (course.update), its status (course.activate, course.archive), its
// department (course.move) and its first instructor
// (course.seat_instructor). Read through course.list, since course.get needs
// a seat in the course and an administrator usually has none; course.list
// lists a department's administrator only the courses they administer, so
// any other is not found here.
import { computed, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import { useContainerNarrow } from '@/composables/useContainerWidth'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { useWrite } from '@/composables/useWrite'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import TimeText from '@/components/TimeText.vue'
import EditCourseDialog from './components/EditCourseDialog.vue'
import MoveCourseDialog from './components/MoveCourseDialog.vue'
import SeatInstructorCard from './components/SeatInstructorCard.vue'
import { findCourse, useCanonicalId } from './components/adminShared'

const props = defineProps<{ courseId: string }>()
const { t } = useI18n()
const session = useSessionStore()
const courseStore = useCourseStore()
// The details in two columns while their card has room for both, a label and
// its value each, whatever the window: the side bar takes from it. The card is
// measured by its title, as wide as what it holds.
const details = useTemplateRef<HTMLElement>('details')
const narrow = useContainerNarrow(details, 539)
/** The course's id as Core writes it, whatever the address says. */
const id = useCanonicalId(() => props.courseId, 'courseId')

const state = useAsync(() => findCourse(id.value, t('admin.course.notFound')), {
  watch: [id],
  keepData: true,
})
const course = computed(() => (state.data.value?.id === id.value ? state.data.value : undefined))
const termsState = useAsync(() => read('term.list', {}).then((o) => o.terms ?? []))
const departments = useDepartmentTree()
const term = computed(() => (termsState.data.value ?? []).find((x) => x.id === course.value?.term_id))
/** Where its department is in the tree, from the top. */
const deptPath = computed(() => (course.value ? departments.pathLabel(course.value.dept_id) : ''))
/** Somewhere the caller administers that it could move to. */
const canMove = computed(() => {
  if (!course.value) return false
  const any = (ds: ReturnType<typeof departments.courseDestinations>): boolean =>
    ds.some((d) => !d.disabled || any(d.children ?? []))
  return any(departments.courseDestinations(course.value.dept_id))
})
const moving = ref(false)
async function onMoved() {
  await state.reload()
  void departments.reload()
}

const seat = computed(() => session.membershipFor(id.value))
const archived = computed(() => course.value?.status === 'archived')
const codeLabel = computed(() =>
  course.value ? `${course.value.code}${course.value.section ? ` · ${course.value.section}` : ''}` : '',
)

const activateW = useWrite('course.activate')
const archiveW = useWrite('course.archive')

/** After the status changes: this page, the sidebar's flags, and the open course if it is this one. */
async function refreshAll() {
  await state.reload()
  if (seat.value) void session.loadMemberships().catch(() => undefined)
  if (courseStore.courseId === id.value) void courseStore.open(id.value, true)
}

async function activate() {
  const c = course.value
  if (!c) return
  if (c.status === 'archived') {
    const ok = await ElMessageBox.confirm(t('admin.course.reopenConfirm'), t('admin.course.reopenTitle', { code: codeLabel.value }), {
      type: 'info',
      confirmButtonText: t('admin.course.reopen'),
      cancelButtonText: t('common.actions.cancel'),
    }).catch(() => false)
    if (!ok) return
  }
  const out = await activateW.run({ course_id: c.id }, { success: t('admin.course.activated') })
  if (out) await refreshAll()
}

async function archive() {
  const c = course.value
  if (!c) return
  const ok = await ElMessageBox.confirm(t('admin.course.archiveConfirm'), t('admin.course.archiveTitle', { code: codeLabel.value }), {
    type: 'warning',
    confirmButtonText: t('admin.course.archive'),
    cancelButtonText: t('common.actions.cancel'),
    confirmButtonClass: 'el-button--danger',
  }).catch(() => false)
  if (!ok) return
  const out = await archiveW.run({ course_id: c.id }, { success: t('admin.course.archived') })
  if (out) await refreshAll()
}

const editing = ref(false)

function onSeated(_memberId: string, actorId: string) {
  // Seating oneself gives one a way into the course's own pages.
  if (actorId === session.me?.id) void session.loadMemberships().catch(() => undefined)
}
</script>

<template>
  <div class="course-admin">
    <PageHeader
      :title="course?.title ?? t('admin.course.title')"
      :back="{ name: 'admin-courses' }"
    >
      <template v-if="course" #subtitle
        >{{ course.code }}<template v-if="course.section"><span class="app-sep">·</span>{{ course.section }}</template></template
      >
      <template #tags>
        <StatusTag v-if="course" vocab="courseStatus" :value="course.status" size="default" />
      </template>
      <template v-if="course">
        <router-link v-if="seat" :to="{ name: 'course-overview', params: { courseId: id } }">
          <el-button>
            <el-icon><Right /></el-icon>
            <span>{{ t('admin.course.openCourse') }}</span>
          </el-button>
        </router-link>
        <el-button
          v-if="course.status !== 'active'"
          type="primary"
          :loading="activateW.pending.value"
          @click="activate"
        >
          <el-icon><VideoPlay /></el-icon>
          <span>{{ course.status === 'archived' ? t('admin.course.reopen') : t('admin.course.activate') }}</span>
        </el-button>
        <el-button v-if="course.status !== 'archived'" type="danger" plain :loading="archiveW.pending.value" @click="archive">
          <el-icon><Box /></el-icon>
          <span>{{ t('admin.course.archive') }}</span>
        </el-button>
      </template>
    </PageHeader>

    <AsyncState :loading="state.loading.value && !course" :error="course ? null : state.error.value" @retry="state.reload">
      <template v-if="course">
        <el-alert
          :type="course.status === 'archived' ? 'warning' : course.status === 'draft' ? 'info' : 'success'"
          :title="t(`admin.course.statusHelp.${course.status}`)"
          :closable="false"
          show-icon
          class="course-admin__alert"
        />
        <el-alert
          :type="seat ? 'success' : 'info'"
          :closable="false"
          class="course-admin__alert"
          :title="
            seat
              ? t('admin.course.seatedAs', { role: t(`enums.role.${seat.role}`) })
              : session.isAdmin
                ? t('admin.course.notSeated')
                : t('deptAdmin.course.notSeated')
          "
        />

        <div class="course-admin__grid app-columns">
          <section class="app-card">
            <h2 ref="details" class="app-card__title">
              <span>{{ t('admin.course.details') }}</span>
              <span class="course-admin__title-actions">
                <el-button v-if="canMove" size="small" :disabled="archived" @click="moving = true">
                  <el-icon><Rank /></el-icon>
                  <span>{{ t('deptAdmin.course.move') }}</span>
                </el-button>
                <el-button size="small" :disabled="archived" @click="editing = true">
                  <el-icon><Edit /></el-icon>
                  <span>{{ t('admin.course.edit') }}</span>
                </el-button>
              </span>
            </h2>
            <el-descriptions :column="narrow ? 1 : 2" border class="course-admin__desc">
              <el-descriptions-item :label="t('admin.course.code')">
                <strong>{{ course.code }}</strong>
              </el-descriptions-item>
              <el-descriptions-item :label="t('admin.course.section')">
                <span v-if="course.section">{{ course.section }}</span>
                <span v-else class="app-muted">{{ t('admin.course.noSection') }}</span>
              </el-descriptions-item>
              <el-descriptions-item :label="t('admin.course.term')">
                <template v-if="term">
                  <div>{{ term.name }}</div>
                  <div class="app-muted course-admin__small">
                    {{ t('admin.courses.termDates', { from: term.starts_on, to: term.ends_on }) }}
                  </div>
                </template>
                <IdText v-else :id="course.term_id" />
              </el-descriptions-item>
              <el-descriptions-item :label="t('admin.course.dept')">
                <span v-if="deptPath" class="course-admin__path">{{ deptPath }}</span>
                <IdText v-else :id="course.dept_id" />
              </el-descriptions-item>
              <el-descriptions-item :label="t('admin.course.status')">
                <StatusTag vocab="courseStatus" :value="course.status" />
              </el-descriptions-item>
              <el-descriptions-item :label="t('admin.course.created')">
                <TimeText :value="course.created_at" />
              </el-descriptions-item>
              <el-descriptions-item :label="t('admin.course.id')" :span="narrow ? 1 : 2">
                <IdText :id="course.id" :full="!narrow" />
              </el-descriptions-item>
            </el-descriptions>
            <h3 class="course-admin__subhead">{{ t('admin.course.description') }}</h3>
            <p v-if="course.description" class="course-admin__description">{{ course.description }}</p>
            <p v-else class="app-muted course-admin__description">{{ t('admin.course.noDescription') }}</p>
          </section>

          <SeatInstructorCard :course-id="course.id" :disabled="archived" @seated="onSeated" />
        </div>

        <EditCourseDialog v-model="editing" :course="course" @saved="state.reload" />
        <MoveCourseDialog v-model="moving" :course="course" @moved="onMoved" />
      </template>
    </AsyncState>
  </div>
</template>

<style scoped>
.course-admin__alert {
  margin-bottom: 12px;
}
/* The page's own width decides its columns, not the window's: the side bar takes from it. */
.course-admin {
  container-type: inline-size;
}
.course-admin__grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
  margin-top: 4px;
}
.course-admin__grid > .app-card + .app-card {
  margin-top: 0;
}
/* Two columns (3 : 2) while the details keep room for their own two (a card of 590 px). */
@container (max-width: 999px) {
  .course-admin__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* A label breaks between words, never inside one (課程編 / 號). */
.course-admin__desc :deep(.el-descriptions__label) {
  white-space: nowrap;
}
.course-admin__small {
  font-size: var(--app-text-xs);
}
.course-admin__title-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.course-admin__title-actions .el-button + .el-button {
  margin-left: 0;
}
.course-admin__path {
  word-break: break-word;
}
.course-admin__subhead {
  margin: 18px 0 6px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.course-admin__description {
  margin: 0;
  font-size: var(--app-text-md);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: var(--app-lh-text);
}
</style>
