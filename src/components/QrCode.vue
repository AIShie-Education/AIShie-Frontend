<script setup lang="ts">
// A QR code for a piece of text (a link, mostly), drawn as an SVG. It is
// black on white in either theme: a code in light on dark is one that many
// phones' cameras do not read.
import { computed } from 'vue'
import { qrModules, qrPath, qrSide, type QrLevel } from '@/utils/qr'

const props = withDefaults(
  defineProps<{
    value: string
    /** Width and height on the page, in CSS pixels. */
    size?: number
    level?: QrLevel
    /** What the code is, for someone who cannot see it. */
    label: string
  }>(),
  { size: 240, level: 'M' },
)

const code = computed(() => {
  try {
    const modules = qrModules(props.value, props.level)
    return { path: qrPath(modules), side: qrSide(modules) }
  } catch {
    // Longer than any code holds; nothing a link of ours would be.
    return null
  }
})
</script>

<template>
  <svg
    v-if="code"
    class="qr-code"
    role="img"
    :aria-label="label"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${code.side} ${code.side}`"
    shape-rendering="crispEdges"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100%" height="100%" fill="#ffffff" />
    <path :d="code.path" fill="#000000" />
  </svg>
</template>

<style scoped>
.qr-code {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>
