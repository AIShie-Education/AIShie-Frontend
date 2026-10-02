<script setup lang="ts">
// One actor at a glance: name, kind, standing, platform role, email, id.
import AgentAvatar from '@/components/AgentAvatar.vue'
import AiBadge from '@/components/AiBadge.vue'
import IdText from '@/components/IdText.vue'
import StatusTag from '@/components/StatusTag.vue'

defineProps<{
  actor: {
    id: string
    display_name: string
    kind: string
    email?: string | null
    status?: string
    platform_role?: string | null
  }
  /** Link the name to the actor's page. */
  link?: boolean
}>()
</script>

<template>
  <div class="actor-summary">
    <AgentAvatar v-if="actor.kind === 'agent'" :name="actor.display_name" size="large" />
    <el-avatar v-else :size="36" class="actor-summary__avatar">
      <el-icon v-if="actor.kind === 'system'"><Setting /></el-icon>
      <template v-else>{{ actor.display_name.slice(0, 1) }}</template>
    </el-avatar>
    <div class="actor-summary__body">
      <div class="actor-summary__line">
        <router-link v-if="link" :to="{ name: 'admin-actor', params: { actorId: actor.id } }" class="actor-summary__name">
          {{ actor.display_name }}
        </router-link>
        <span v-else class="actor-summary__name">{{ actor.display_name }}</span>
        <AiBadge v-if="actor.kind === 'agent'" />
        <StatusTag v-else vocab="actorKind" :value="actor.kind" />
        <StatusTag v-if="actor.status && actor.status !== 'active'" vocab="actorStatus" :value="actor.status" />
        <StatusTag v-if="actor.platform_role" vocab="platformRole" :value="actor.platform_role" />
      </div>
      <div class="actor-summary__meta">
        <span v-if="actor.email" class="actor-summary__email">{{ actor.email }}</span>
        <IdText :id="actor.id" />
        <span v-if="$slots.meta" class="app-muted"><slot name="meta" /></span>
      </div>
    </div>
    <div v-if="$slots.default" class="actor-summary__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.actor-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.actor-summary__avatar {
  flex-shrink: 0;
  background: var(--el-fill-color-dark);
  color: var(--el-text-color-primary);
  font-weight: 600;
}
.actor-summary__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.actor-summary__line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.actor-summary__name {
  font-weight: 600;
  word-break: break-word;
}
a.actor-summary__name {
  text-decoration: none;
}
a.actor-summary__name:hover {
  text-decoration: underline;
}
.actor-summary__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}
.actor-summary__email {
  color: var(--el-text-color-regular);
  word-break: break-all;
}
.actor-summary__actions {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
}
</style>
