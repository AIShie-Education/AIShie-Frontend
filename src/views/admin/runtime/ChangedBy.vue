<script setup lang="ts">
// "Changed by Ada, 30 Sep 2026 10:12": who last wrote a setting of the
// runtime's, by name where it can be read, and when.
import TimeText from '@/components/TimeText.vue'
import ActorLink from './ActorLink.vue'

defineProps<{ by: string | null; at: string | null }>()
</script>

<template>
  <i18n-t v-if="by && at" keypath="runtimeAdmin.changedBy" tag="span" scope="global" class="changed-by">
    <template #who><ActorLink :id="by" /></template>
    <template #when><TimeText :value="at" /></template>
  </i18n-t>
  <TimeText v-else-if="at" :value="at" class="changed-by" />
</template>
