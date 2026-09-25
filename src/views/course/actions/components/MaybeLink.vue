<script setup lang="ts">
// A link where there is somewhere to go, plain text where there is not.
import type { RouteLocationRaw } from 'vue-router'
defineProps<{ to?: RouteLocationRaw | null }>()
</script>

<template>
  <router-link v-if="to" :to="to" class="maybe-link" @click.stop><slot /></router-link>
  <span v-else><slot /></span>
</template>

<style scoped>
.maybe-link {
  text-decoration: none;
}
.maybe-link:hover {
  text-decoration: underline;
}
</style>
