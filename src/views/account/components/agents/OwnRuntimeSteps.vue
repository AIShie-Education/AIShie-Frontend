<script setup lang="ts">
// "Run the AIshie runtime yourself (advanced)": for someone who operates an
// AIshie Agent Runtime of their own. The runtime reads an agent file (YAML)
// from its agents directory, which names Core's base URL and the secret the
// token is kept in; the token is never in the file, and the runtime refuses
// one written there. The file is folded away until asked for, and its model
// block is only an example to change.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { CORE_ORIGIN } from '@/api/http'
import CopyBlock from './CopyBlock.vue'
import { runtimeAgentFile } from './agents'

const props = defineProps<{ name: string; actorId: string }>()
const { t } = useI18n()

const file = computed(() => runtimeAgentFile({ coreUrl: CORE_ORIGIN, name: props.name, actorId: props.actorId }))
</script>

<template>
  <div class="own-runtime">
    <p class="app-form-hint own-runtime__intro">{{ t('agents.connect.runtimeIntro') }}</p>
    <details class="own-runtime__file">
      <summary>{{ t('agents.connect.agentFile') }}</summary>
      <CopyBlock :text="file.yaml" :label="t('agents.connect.agentFile')" class="own-runtime__block" />
      <p class="app-form-hint own-runtime__hint">
        {{ t('agents.connect.agentFileHint', { file: file.tokenFile, variable: file.tokenVar }) }}
      </p>
      <p class="app-form-hint own-runtime__hint own-runtime__model">{{ t('agents.connect.modelExample') }}</p>
    </details>
  </div>
</template>

<style scoped>
.own-runtime__intro {
  margin: 0 0 8px;
}
.own-runtime__file {
  font-size: 13px;
}
.own-runtime__file summary {
  cursor: pointer;
  color: var(--el-color-primary);
}
.own-runtime__block {
  margin: 10px 0;
}
.own-runtime__hint {
  margin: 4px 0 0;
}
</style>
