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
    <div class="overview__grid">
      <div class="overview__main">
        <AttentionCard :course-id="courseId" />
        <AboutCard />
        <AssignmentsCard v-if="course.can('document_read')" :course-id="courseId" />
        <RecentActivityCard v-if="course.can('document_read')" :course-id="courseId" />
      </div>
      <aside class="overview__side">
        <SeatCard :course-id="courseId" />
        <PermsCard />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.overview__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 16px;
  align-items: start;
}
.overview__main,
.overview__side {
  min-width: 0;
}
@media (max-width: 960px) {
  .overview__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.overview__side {
  display: flex;
  flex-direction: column;
}
</style>
