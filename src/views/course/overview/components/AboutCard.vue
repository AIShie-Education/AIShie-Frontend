<script setup lang="ts">
// The course's own description (course.get, held by the course store), and
// for its instructors — whoever manages its members — changing its title and
// description (course.update_details).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdministersCourse } from '@/composables/useAdministersCourse'
import { useCourseStore } from '@/stores/course'
import MarkdownView from '@/components/MarkdownView.vue'
import TimeText from '@/components/TimeText.vue'
import EditDetailsDialog from './EditDetailsDialog.vue'

const course = useCourseStore()
const { t } = useI18n()

const canEdit = computed(() => course.can('member_manage'))
const editing = ref(false)
async function onEdited(status: 'executed' | 'proposed') {
  if (status === 'executed' && course.courseId) await course.open(course.courseId, true)
}
// The way to the course's administration page, where its code, section,
// term and department change: for whoever administers it.
const administers = useAdministersCourse()

const description = computed(() => course.course?.description?.trim() ?? '')
// A long description is folded, so that what needs doing is not pushed down.
const long = computed(() => description.value.length > 600 || description.value.split('\n').length > 12)
const expanded = ref(false)
</script>

<template>
  <section class="app-card about">
    <h2 class="app-card__title">
      <span>{{ t('overview.about.title') }}</span>
      <el-tooltip v-if="canEdit" :content="t('common.archivedCourse')" :disabled="course.writable" placement="top">
        <span>
          <el-button size="small" :disabled="!course.writable" @click="editing = true">
            <el-icon><Edit /></el-icon><span>{{ t('overview.details.edit') }}</span>
          </el-button>
        </span>
      </el-tooltip>
    </h2>
    <el-alert
      v-if="course.course?.status === 'draft'"
      type="info"
      :closable="false"
      show-icon
      class="about__draft"
      :title="t('common.draftCourse')"
    />
    <div class="about__desc" :class="{ 'is-folded': long && !expanded }">
      <MarkdownView :source="description" :empty="t('overview.about.noDescription')" />
    </div>
    <el-button v-if="long" link type="primary" class="about__toggle" @click="expanded = !expanded">
      {{ expanded ? t('overview.about.showLess') : t('overview.about.showMore') }}
    </el-button>
    <p v-if="course.course?.created_at" class="about__meta app-muted">
      {{ t('overview.about.created') }}
      <TimeText :value="course.course.created_at" />
    </p>
    <EditDetailsDialog
      v-if="canEdit && course.course"
      v-model="editing"
      :course="course.course"
      :administers="administers"
      @done="onEdited"
    />
  </section>
</template>

<style scoped>
.about__draft {
  margin-bottom: 12px;
}
.about__desc {
  position: relative;
  overflow-wrap: anywhere;
}
.about__desc.is-folded {
  max-height: 220px;
  overflow: hidden;
}
.about__desc.is-folded::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 56px;
  background: linear-gradient(to bottom, transparent, var(--el-bg-color));
}
.about__toggle {
  margin-top: 4px;
}
.about__meta {
  margin: 12px 0 0;
  font-size: 12px;
}
</style>
