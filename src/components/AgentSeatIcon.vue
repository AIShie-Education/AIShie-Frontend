<script setup lang="ts">
// The icon for agents as a kind of thing: a person beside a seat, the line
// icon aishie.app draws for "AI joins as a course member" (stroke 1.8,
// round caps and joins, on a 24 grid). It is drawn in the current colour and
// sized by the font, as Element Plus's icons are, so it goes in an
// `<el-icon>` or anywhere an icon goes, and by name wherever icons are
// listed as components (the activity bar, a course's tabs). It stands for
// agents in general (a view, a tab, a kind to choose); one agent in
// particular is shown by its AgentAvatar.
</script>

<template>
  <svg
    class="agent-seat-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <rect x="15" y="4" width="7" height="7" rx="2" />
    <path d="M18.5 14v6" />
  </svg>
</template>

<style scoped>
.agent-seat-icon {
  width: 1em;
  height: 1em;
  fill: none;
}
</style>
