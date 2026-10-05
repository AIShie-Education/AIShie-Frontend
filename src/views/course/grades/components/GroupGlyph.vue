<script setup lang="ts">
// Two people side by side, in a line: the mark of a grade given from a
// group's (the class's gradebook draws it before the score). Decorative:
// what it says is said in words beside it, to a screen reader and in the
// cell's tooltip.
</script>

<template>
  <svg
    class="group-glyph"
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="1.4"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="5.5" cy="5.5" r="2.25" />
    <path d="M1.5 13.5c0-2.3 1.8-4 4-4s4 1.7 4 4" />
    <circle cx="11" cy="5" r="1.9" />
    <path d="M10.6 9.1c2.2-.2 3.9 1.5 3.9 3.9" />
  </svg>
</template>

<style scoped>
.group-glyph {
  flex-shrink: 0;
  vertical-align: -0.125em;
}
</style>
