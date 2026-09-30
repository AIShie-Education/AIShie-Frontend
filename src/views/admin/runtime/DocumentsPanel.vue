<script setup lang="ts">
// Documents: how the runtime reads them for models, each a card the runtime
// answers for apart. Reading scanned files and images (OCR), and writing
// each version's text version (文字版) with a model of the school's plan.
import OcrCard from './OcrCard.vue'
import TranscriptionCard from './TranscriptionCard.vue'
</script>

<template>
  <div class="documents-panel">
    <OcrCard />
    <TranscriptionCard />
  </div>
</template>
