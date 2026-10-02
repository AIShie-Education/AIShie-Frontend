<script setup lang="ts">
// An agent's name with its "AI" (AiBadge) after it, which never parts from
// it. A name that wraps keeps its last word (in Chinese, its last character)
// on the line of the "AI" (splitNameEnd), so that the "AI" never stands
// alone on a line of its own. `ellipsis`: the name is cut short on one line
// instead, and the "AI" stays whole after it. Whose agent it is, and how it
// runs, go after this (AgentBadge with no-ai, HostingTag).
import { computed } from 'vue'
import { splitNameEnd } from '@/utils/initials'
import AiBadge from './AiBadge.vue'

const props = defineProps<{ name: string | null | undefined; ellipsis?: boolean }>()
const parts = computed(() => splitNameEnd(props.name))
</script>

<template>
  <span v-if="ellipsis" class="agent-name is-ellipsis"
    ><span class="agent-name__text">{{ name }}</span
    ><AiBadge class="agent-name__ai"
  /></span>
  <span v-else class="agent-name"
    >{{ parts.head }}<span class="agent-name__end">{{ parts.end }}<AiBadge class="agent-name__ai" /></span
  ></span>
</template>

<style scoped>
.agent-name {
  min-width: 0;
}
.agent-name__end {
  white-space: nowrap;
}
.agent-name__ai {
  margin-left: 6px;
  vertical-align: 1px;
}
.agent-name.is-ellipsis {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}
.agent-name.is-ellipsis .agent-name__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-name.is-ellipsis .agent-name__ai {
  vertical-align: middle;
}
</style>
