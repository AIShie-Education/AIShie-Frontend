<script setup lang="ts">
// How an agent runs, beside its name wherever it is shown in detail (its
// page, a member list, the agents one may ask): hosted on AIshie (runtime) or
// MCP access (mcp), with a line on what that means in its tooltip. For an
// agent hosted on AIshie, given whether people can ask it now (Core's
// site_chat), a second tag says so: it can be asked on the site, or it is not
// running. Given no hosting this app knows (a person, an older Core), it
// shows nothing, so it can sit beside any actor or member. How it runs is a
// kind, and whether it can be asked is not an outcome: both are neutral, as
// categories are (docs/CONVENTIONS.md, "Colour"), and an agent is never shown
// "online" in green. Only "not running", which wants someone to see to it,
// takes the amber of what waits for a person.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hostingOf } from '@/utils/agents'

const props = withDefaults(
  defineProps<{
    hosting: string | null | undefined
    /** Whether people can ask it on the site now; left out (not cast to false), nothing is said of it. */
    siteChat?: boolean | null
    size?: 'small' | 'default' | 'large'
  }>(),
  { siteChat: null, size: 'small' },
)
const { t } = useI18n()

const mode = computed(() => hostingOf(props.hosting))
/** For an agent hosted on AIshie: whether it can be asked now, when that was given. */
const askable = computed<'on' | 'off' | null>(() =>
  mode.value === 'runtime' && typeof props.siteChat === 'boolean' ? (props.siteChat ? 'on' : 'off') : null,
)
</script>

<template>
  <span v-if="mode" class="hosting-tag" :class="`is-${mode}`">
    <el-tooltip :content="t(`common.agent.hosting.${mode}Help`)" placement="top">
      <el-tag
        type="info"
        effect="plain"
        :size="size ?? 'small'"
        class="hosting-tag__mode"
        disable-transitions
        tabindex="0"
      >
        <el-icon aria-hidden="true"><Monitor v-if="mode === 'runtime'" /><Connection v-else /></el-icon>
        <span>{{ t(`common.agent.hosting.${mode}`) }}</span>
      </el-tag>
    </el-tooltip>
    <el-tooltip v-if="askable" :content="t(`common.agent.askable.${askable}Help`)" placement="top">
      <el-tag
        :type="askable === 'on' ? 'info' : 'warning'"
        :effect="askable === 'on' ? 'light' : 'plain'"
        :size="size ?? 'small'"
        class="hosting-tag__askable"
        :class="`is-${askable}`"
        disable-transitions
        tabindex="0"
      >
        {{ t(`common.agent.askable.${askable}`) }}
      </el-tag>
    </el-tooltip>
  </span>
</template>

<style scoped>
.hosting-tag {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
  vertical-align: middle;
}
.hosting-tag__mode :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
