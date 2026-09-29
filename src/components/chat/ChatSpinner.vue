<script setup lang="ts">
// The small glyph that turns while an agent works, as an agent chat's
// spinner: out through a few stars and back. Still where motion is reduced.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/** The glyph's turns, out and back. */
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const FRAME_MS = 130

const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
const frame = ref(reduced ? 4 : 0)
let spin: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  if (!reduced) spin = setInterval(() => (frame.value = (frame.value + 1) % FRAMES.length), FRAME_MS)
})
onBeforeUnmount(() => clearInterval(spin))
const glyph = computed(() => FRAMES[frame.value])
</script>

<template>
  <span class="chat-spinner" aria-hidden="true">{{ glyph }}</span>
</template>

<style scoped>
.chat-spinner {
  display: inline-block;
  flex-shrink: 0;
  width: 1em;
  text-align: center;
  font-size: 15px;
  line-height: 1;
  color: var(--app-light);
}
</style>
