<script setup lang="ts">
// Reading a list again (docs/CONVENTIONS.md, "Refresh"): always at the right
// end of its section's toolbar (.app-toolbar, or the section's title row
// where it has no toolbar), never in a page's header, which holds what
// creates or goes elsewhere. A text button with its words, "Refresh" on every
// page; on a phone's screen (600 px or narrower) a square of its icon alone,
// as tall as any button and as wide, its words in its tooltip and its name.
import { useI18n } from 'vue-i18n'
import { Refresh } from '@element-plus/icons-vue'
import { useMediaQuery } from '@/composables/useMediaQuery'

defineOptions({ inheritAttrs: false })
defineProps<{ loading?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ click: [] }>()
const { t } = useI18n()
const phone = useMediaQuery('(max-width: 600px)')
</script>

<template>
  <el-tooltip :content="t('common.actions.refresh')" :disabled="!phone" placement="top">
    <el-button
      v-bind="$attrs"
      class="refresh-button"
      :class="{ 'is-icon': phone }"
      :loading="loading"
      :disabled="disabled"
      :aria-label="phone ? t('common.actions.refresh') : undefined"
      @click="emit('click')"
    >
      <el-icon v-if="!loading" aria-hidden="true"><Refresh /></el-icon>
      <span v-if="!phone">{{ t('common.actions.refresh') }}</span>
    </el-button>
  </el-tooltip>
</template>

<style scoped>
/* At the right end of its row, however the row is laid out. */
.el-button.refresh-button {
  margin-inline-start: auto;
}
/* Its icon alone: a square, 36 px or a finger's 44. */
.el-button.refresh-button.is-icon {
  width: var(--el-component-size);
  padding: 0;
}
</style>
