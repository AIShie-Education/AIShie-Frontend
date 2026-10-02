<script setup lang="ts">
// The mark of an autonomy level, by shape, not by hue: a lock for denied, a
// raised hand for confirm_required (someone approves each), an eye for
// pending_review (someone looks after) and a bolt for autonomous. Line icons
// of 24 px, drawn in the current colour: the path data of Lucide's lock,
// hand, eye and zap (https://lucide.dev), under the ISC License, lock
// derived from Feather under the MIT License. Their copyright and permission
// notices are in THIRD-PARTY-NOTICES.md, at the repository's root.
import type { AutonomyLevel } from '@/api/types'

defineProps<{ level: AutonomyLevel | string }>()
</script>

<template>
  <svg
    class="level-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="level === 'denied'">
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </template>
    <template v-else-if="level === 'confirm_required'">
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </template>
    <template v-else-if="level === 'pending_review'">
      <path d="M2.06 12.35a1 1 0 0 1 0-.7a10.75 10.75 0 0 1 19.88 0a1 1 0 0 1 0 .7a10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else-if="level === 'autonomous'">
      <path
        d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      />
    </template>
  </svg>
</template>

<style scoped>
.level-icon {
  width: 1.1em;
  height: 1.1em;
  flex-shrink: 0;
  vertical-align: -0.15em;
}
</style>
