<script setup lang="ts">
// The top bar on a course's pages: the way back up, "CS101 · A Introduction
// to Programming › Materials", rather than the page's name again. The course
// leads to its overview, the tab to its own page where the page shown is one
// under it (a document, under Materials), and on the grades' pages the
// grades' tab chosen follows. On a phone the course is its code alone.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { Course } from '@/api/types'
import { useCourseNav } from './courseNav'

const props = defineProps<{ course: Pick<Course, 'id' | 'code' | 'section' | 'title'> }>()
const { t } = useI18n()
const route = useRoute()
const nav = useCourseNav()

/** The tab is a link where the page shown is not the tab's own, and has no grades' tab after it. */
const tabLinks = computed(() => route.name !== nav.active.value.name && !nav.activeSub.value)
/** The grades' tab chosen, past the first, which is Grades' own page. */
const sub = computed(() =>
  nav.activeSub.value && nav.activeSub.value.name !== 'course-grades' ? nav.activeSub.value : null,
)
</script>

<template>
  <nav class="course-crumbs" :aria-label="t('layout.course.crumbs')">
    <ol>
      <li class="course-crumbs__course">
        <router-link
          :to="{ name: 'course-overview', params: { courseId: props.course.id } }"
          :title="props.course.title"
        >
          <span class="course-crumbs__code">
            {{ props.course.code }}<template v-if="props.course.section"> · {{ props.course.section }}</template>
          </span>
          <span class="course-crumbs__title">{{ props.course.title }}</span>
        </router-link>
      </li>
      <li class="course-crumbs__page">
        <router-link
          v-if="tabLinks || sub"
          :to="{ name: nav.active.value.name, params: { courseId: props.course.id } }"
        >
          {{ t(nav.active.value.label) }}
        </router-link>
        <span v-else aria-current="page">{{ t(nav.active.value.label) }}</span>
      </li>
      <li v-if="sub" class="course-crumbs__page">
        <span aria-current="page">{{ t(sub.label) }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.course-crumbs {
  min-width: 0;
}
.course-crumbs ol {
  display: flex;
  align-items: baseline;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  white-space: nowrap;
}
.course-crumbs li {
  display: flex;
  align-items: baseline;
  min-width: 0;
}
/* The separator is drawn, not read: the list says where each step is. */
.course-crumbs li + li::before {
  content: '›';
  content: '›' / '';
  margin: 0 8px;
  color: var(--app-ink-3);
}
.course-crumbs a {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  color: var(--el-text-color-regular);
  text-decoration: none;
  border-radius: 4px;
}
.course-crumbs a:hover {
  color: var(--app-indigo);
}
.course-crumbs__course {
  flex: 0 1 auto;
}
.course-crumbs__page {
  flex: 0 0 auto;
}
.course-crumbs__code {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: var(--app-weight-strong, 600);
  letter-spacing: 0.04em;
  color: var(--app-indigo);
}
.course-crumbs__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.course-crumbs [aria-current='page'] {
  font-weight: var(--app-weight-strong, 600);
  color: var(--app-ink);
}
/* On a phone: the course's code alone, then the tab. */
@media (max-width: 640px) {
  .course-crumbs__title {
    display: none;
  }
}
</style>
