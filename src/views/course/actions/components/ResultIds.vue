<script setup lang="ts">
// What an executed action made or changed, as links: the grade it entered,
// the document it created, the member it seated.
import { computed } from 'vue'
import IdText from '@/components/IdText.vue'
import MaybeLink from './MaybeLink.vue'
import { RESULT_ID_FIELDS, fieldLabel, isObject, routeFor, str } from './actionText'

const props = defineProps<{ courseId: string; result: unknown; exclude?: string[] }>()

const items = computed(() => {
  const r = props.result
  if (!isObject(r)) return []
  return RESULT_ID_FIELDS.filter((f) => f !== 'id' && !props.exclude?.includes(f) && str(r[f])).map((f) => ({
    field: f,
    id: str(r[f])!,
    to: routeFor(props.courseId, f, str(r[f])),
  }))
})
</script>

<template>
  <span v-if="items.length" class="result-ids">
    <span v-for="it in items" :key="it.field" class="result-ids__item">
      <MaybeLink :to="it.to">{{ fieldLabel(it.field) }}</MaybeLink>
      <IdText :id="it.id" />
    </span>
  </span>
</template>

<style scoped>
.result-ids {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.result-ids__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
