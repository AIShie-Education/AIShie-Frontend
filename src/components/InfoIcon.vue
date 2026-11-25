<script setup lang="ts">
// An outlined information glyph for a control that opens an explanation.
// Element Plus offers only the solid InfoFilled, whose filled disc reads as
// chosen beside the app's outlined icons. Explanations themselves are AppNote
// and carry no icon (docs/CONVENTIONS.md, "Notes and alerts").
</script>

<template>
  <svg
    class="info-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <path d="M12 7.5h.01" />
  </svg>
</template>

<style scoped>
.info-icon {
  width: 1em;
  height: 1em;
  fill: none;
}
</style>
