<script setup lang="ts">
// The grades' own tabs (Grades, the gradebook, the grading scheme), in the
// page header of each of their pages, where its title would be: the course's
// tab strip says Grades, and this which of its pages is shown.
import { useI18n } from 'vue-i18n'
import { useCourseNav } from './courseNav'

const { t } = useI18n()
const nav = useCourseNav()
</script>

<template>
  <nav v-if="nav.subTabs.value" class="course-subtabs" :aria-label="t('layout.course.gradesNav')">
    <router-link
      v-for="sub in nav.subTabs.value"
      :key="sub.name"
      :to="sub.to"
      class="course-subtabs__item"
      :class="{ 'is-active': nav.activeSub.value?.name === sub.name }"
      :aria-current="nav.activeSub.value?.name === sub.name ? 'page' : undefined"
    >
      <el-icon aria-hidden="true"><component :is="sub.icon" /></el-icon>
      <span>{{ t(sub.label) }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
/* A row of quiet links, the one shown tinted, as the side bar marks the page it is on. One row, as the
   course's tabs are: a tab alone on a second row reads as a fault. Where the page is too narrow for them
   with their icons (a phone, in English), the icons go; narrower still, the row scrolls sideways
   (its parent in PageHeader keeps min-width: 0 for that, rather than grow to the row's width). */
.course-subtabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}
.course-subtabs::-webkit-scrollbar {
  display: none;
}
@container (max-width: 480px) {
  .course-subtabs__item .el-icon {
    display: none;
  }
}
.course-subtabs__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--app-radius-control);
  color: var(--el-text-color-regular);
  font-size: var(--app-text-md);
  text-decoration: none;
  white-space: nowrap;
}
.course-subtabs__item:hover {
  background: var(--app-ground-2);
  color: var(--app-ink);
}
.course-subtabs__item.is-active {
  background: var(--app-indigo-tint);
  color: var(--app-indigo);
  font-weight: 500;
}
.course-subtabs__item:focus-visible {
  outline-offset: -2px;
}
/* On a touch screen, pressed often: 40 px (docs/CONVENTIONS.md). */
@media (pointer: coarse) {
  .course-subtabs__item {
    height: 40px;
  }
}
</style>
