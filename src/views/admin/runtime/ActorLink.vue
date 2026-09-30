<script setup lang="ts">
// Who changed a setting of the runtime's, by their name in AIshie, linked to
// their page: the runtime names them by their Core actor id alone. The name
// is asked of Core once per page for each id (actor.get, which the
// administrators who open this page may read); without it, the id.
import { shallowRef, watch } from 'vue'
import IdText from '@/components/IdText.vue'
import { actorName } from './runtimeAdmin'

const props = defineProps<{ id: string }>()

const name = shallowRef<string | null>(null)
watch(
  () => props.id,
  async (id) => {
    name.value = null
    const n = await actorName(id)
    if (props.id === id) name.value = n
  },
  { immediate: true },
)
</script>

<template>
  <router-link v-if="name" :to="{ name: 'admin-actor', params: { actorId: id } }" class="actor-link">{{
    name
  }}</router-link>
  <IdText v-else :id="id" />
</template>
