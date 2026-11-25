<script setup lang="ts">
// The small glyph that turns while an agent works, as an agent chat's
// spinner: out through a few stars and back, in the third ink (the amber is
// the brand's dot alone). Still where motion is reduced.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { REDUCED_MOTION_QUERY } from '@/utils/motion'

/** The glyph's turns, out and back. */
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const FRAME_MS = 130

const reduced = useMediaQuery(REDUCED_MOTION_QUERY)
const frame = ref(reduced.value ? 4 : 0)
let spin: ReturnType<typeof setInterval> | undefined
function syncMotion(reduce: boolean) {
  clearInterval(spin)
  spin = undefined
  if (reduce) {
    frame.value = 4
    return
  }
  spin = setInterval(() => (frame.value = (frame.value + 1) % FRAMES.length), FRAME_MS)
}
onMounted(() => syncMotion(reduced.value))
watch(reduced, syncMotion)
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
  font-size: var(--app-text-lg);
  line-height: 1;
  color: var(--app-ink-3);
}
</style>
