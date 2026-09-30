<script setup lang="ts">
// The side bar's administration: the administration pages the caller may
// open. Courses and departments are for a platform administrator and for a
// department's administrator, who sees only what is beneath their
// appointments; people, terms and presets are a platform administrator's
// alone (router/modules/admin.ts decides the same). So are the agent
// runtime's settings (AI and documents), offered only where this server has
// a runtime, as hosting is: its GET /info is asked for a platform
// administrator alone.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useRuntime } from '@/composables/useRuntime'
import { useSessionStore } from '@/stores/session'

const { t } = useI18n()
const route = useRoute()
const session = useSessionStore()
const rt = session.isAdmin ? useRuntime() : null

const SECTIONS = [
  { name: 'admin-courses', also: ['admin-course'], icon: 'School', label: 'admin.nav.courses' },
  { name: 'admin-actors', also: ['admin-actor'], icon: 'User', label: 'admin.nav.actors', platform: true },
  { name: 'admin-terms', icon: 'Calendar', label: 'admin.nav.terms', platform: true },
  { name: 'admin-departments', icon: 'OfficeBuilding', label: 'admin.nav.departments' },
  { name: 'admin-presets', icon: 'Key', label: 'admin.nav.presets', platform: true },
  { name: 'admin-runtime', icon: 'MagicStick', label: 'admin.nav.runtime', platform: true, runtime: true },
]
const sections = computed(() =>
  SECTIONS.filter((s) => (!s.platform || session.isAdmin) && (!s.runtime || !!rt?.available.value)),
)
const isActive = (s: (typeof SECTIONS)[number]) =>
  route.name === s.name || (typeof route.name === 'string' && !!s.also?.includes(route.name))
</script>

<template>
  <nav class="side-list" :aria-label="t('common.nav.admin')">
    <router-link
      v-for="s in sections"
      :key="s.name"
      :to="{ name: s.name }"
      class="side-item side-link"
      :class="{ 'is-active': isActive(s) }"
      :aria-current="isActive(s) ? 'page' : undefined"
    >
      <el-icon aria-hidden="true"><component :is="s.icon" /></el-icon>
      <span>{{ t(s.label) }}</span>
    </router-link>
  </nav>
</template>
