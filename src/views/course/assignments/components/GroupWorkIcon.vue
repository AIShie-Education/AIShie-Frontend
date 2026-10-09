<script setup lang="ts">
// The icon for group work: two people side by side, the one in front whole,
// drawn as AgentSeatIcon is (stroke 1.8, round caps and joins, on a 24 grid,
// in the current colour, sized by the font), so that it goes in an
// `<el-icon>` or as an outline tag's icon. Element Plus has no icon of
// several people.
</script>

<template>
  <svg
    class="group-work-icon"
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
    <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" />
    <path d="M18 14.4c2.1.8 3.5 2.9 3.5 5.6" />
  </svg>
</template>

<style scoped>
.group-work-icon {
  width: 1em;
  height: 1em;
  fill: none;
}
</style>
