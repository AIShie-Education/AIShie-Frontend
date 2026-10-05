<script setup lang="ts">
// The icon for a course's groups: three people, one in front of two, as a
// line drawing in the manner of the agents' seat (AgentSeatIcon: stroke 1.8,
// round caps and joins, on a 24 grid), outlined as navigation's icons are
// (docs/CONVENTIONS.md). Drawn in the current colour and sized by the font,
// it goes in an `<el-icon>` or by name wherever icons are listed as
// components (a course's tabs).
</script>

<template>
  <svg
    class="groups-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="8" r="3.2" />
    <path d="M6.5 20c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" />
    <path d="M6.4 5.7a2.6 2.6 0 0 0-.5 5" />
    <path d="M1.8 18.5c0-2.3 1.3-4.1 3.4-4.7" />
    <path d="M17.6 5.7a2.6 2.6 0 0 1 .5 5" />
    <path d="M22.2 18.5c0-2.3-1.3-4.1-3.4-4.7" />
  </svg>
</template>

<style scoped>
.groups-icon {
  width: 1em;
  height: 1em;
  fill: none;
}
</style>
