<script setup lang="ts">
// A page's header: its title, the page's one h1, a line under it, and its
// primary actions. Inside a course, a title that only names the tab chosen
// (Materials, under the Materials tab) is not shown again: the h1 is kept
// for screen readers, and the subtitle and the actions alone show. On the
// grades' pages, the grades' own tabs take the title's place.
import { computed, Comment, Fragment, inject, Text, useSlots, type VNode } from 'vue'
import { useI18n } from 'vue-i18n'
import { COURSE_PAGE } from '@/layouts/coursePage'

const props = defineProps<{ title: string; subtitle?: string; back?: string | object }>()
const { t } = useI18n()
const slots = useSlots()
const coursePage = inject(COURSE_PAGE, null)

/** The title says no more than the course's tab strip: shown to screen readers alone. */
const quiet = computed(() => !props.back && !!coursePage?.isTabName(props.title))
const subNav = computed(() => (props.back ? null : (coursePage?.subNav.value ?? null)))

/**
 * Whether what a slot gave holds anything to show. A slot passed with every
 * child v-if'd away still exists, and would leave an empty row behind.
 */
function filled(nodes: VNode[] | undefined): boolean {
  return !!nodes?.some((n) => {
    if (n.type === Comment) return false
    if (n.type === Text) return typeof n.children === 'string' && n.children.trim() !== ''
    if (n.type === Fragment) return Array.isArray(n.children) && filled(n.children as VNode[])
    return true
  })
}
</script>

<template>
  <div class="page-header" :class="{ 'is-quiet': quiet, 'in-course': !!coursePage }">
    <div class="page-header__main">
      <router-link
        v-if="back"
        :to="back"
        class="page-header__back"
        :aria-label="t('common.actions.back')"
        :title="t('common.actions.back')"
      >
        <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
      </router-link>
      <div class="page-header__text" :class="{ 'has-subnav': !!subNav }">
        <h1 class="page-header__title" :class="{ 'is-quiet': quiet, 'has-tags': filled(slots.tags?.()) }">
          <span class="page-header__title-text">{{ title }}</span>
          <slot name="tags" />
        </h1>
        <component :is="subNav" v-if="subNav" />
        <p v-if="subtitle || filled($slots.subtitle?.())" class="page-header__subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
    </div>
    <div v-if="filled($slots.default?.())" class="page-header__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.page-header__main {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}
.page-header__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--app-radius-control);
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}
.page-header__back:hover {
  background: var(--app-ground-2);
}
.page-header__title {
  margin: 0;
  font-size: 24px;
  line-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  word-break: break-word;
}
/* A title the tab strip already says: kept for screen readers, with any tags beside it still shown. */
.page-header__title.is-quiet:not(.has-tags),
.page-header__title.is-quiet .page-header__title-text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
/* Inside a course, under its line of context and its tabs, the page's content follows 12 px under its header. */
.page-header.in-course {
  margin-bottom: 12px;
}
/* Then the subtitle and the actions share one row, the actions at its end. */
.page-header.is-quiet {
  align-items: center;
}
/* The line under it takes what the actions leave, down to 320 px, before the actions go under it. */
.page-header.is-quiet .page-header__main {
  flex: 1 1 320px;
}
/* The grades' own tabs, and the subtitle after them on the same line where it fits. */
.page-header__text.has-subnav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 12px;
  row-gap: 4px;
}
.page-header.is-quiet .page-header__subtitle {
  margin-top: 0;
}
.page-header__subtitle {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.page-header__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
