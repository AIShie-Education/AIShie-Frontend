<script setup lang="ts">
// A course at a glance, for whoever holds a seat in it: what is waiting for
// them (proposals, reviews, grades to post), what is due, what happened
// lately, what the course is, and what their seat is and may do. Each part
// reads for itself and stands alone: one the seat may not read says so, or
// steps aside, without taking the page with it.
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import PageHeader from '@/components/PageHeader.vue'
import AboutCard from './components/AboutCard.vue'
import AssignmentsCard from './components/AssignmentsCard.vue'
import AttentionCard from './components/AttentionCard.vue'
import PermsCard from './components/PermsCard.vue'
import RecentActivityCard from './components/RecentActivityCard.vue'
import SeatCard from './components/SeatCard.vue'

defineProps<{ courseId: string }>()
const { t } = useI18n()
const course = useCourseStore()
</script>

<template>
  <div class="overview">
    <PageHeader :title="t('overview.title')" :subtitle="t('overview.subtitle')" />
    <div class="overview__grid app-columns">
      <div class="overview__main app-column">
        <AttentionCard :course-id="courseId" />
        <AboutCard />
        <AssignmentsCard v-if="course.can('document_read')" :course-id="courseId" />
        <RecentActivityCard v-if="course.can('document_read')" :course-id="courseId" />
      </div>
      <aside class="overview__side app-column">
        <SeatCard :course-id="courseId" />
        <PermsCard />
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* The page's own width decides its columns, not the window's: the side bar takes from it. */
.overview {
  container-type: inline-size;
}
.overview__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 16px;
}
.overview__main,
.overview__side {
  min-width: 0;
}
/* Two columns while the main one keeps 420 px or more beside the 360 px one. */
@container (max-width: 799px) {
  .overview__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
