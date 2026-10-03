<script setup lang="ts">
// The whole of what the chat says about a conversation's privacy (privacy.ts):
// who can read it, as Core says, and where an agent among them sends it;
// where it goes to be answered (said of an agent alone), as where data leaves
// the site is said everywhere (DataFlowNotice: the shield on the indigo's
// outline); and what is kept of it. Shown in the pane's dialog, from "More"
// and the ⋯ menu.
import { useI18n } from 'vue-i18n'
import DataFlowNotice from '@/components/DataFlowNotice.vue'
import type { PrivacyNotice } from './privacy'

defineProps<{ notice: PrivacyNotice }>()
const { t } = useI18n()
</script>

<template>
  <div class="chat-privacy">
    <section>
      <h3 class="chat-privacy__heading">{{ t('chat.visibleTo.title') }}</h3>
      <ul>
        <li v-for="(line, i) in notice.readers" :key="i">
          {{ 'key' in line ? t(`chat.visibleTo.${line.key}`) : line.text }}
        </li>
      </ul>
      <p v-if="notice.readersNote" class="chat-privacy__readers-note">
        {{ t(`chat.privacy.${notice.readersNote.key}`, notice.readersNote.params) }}
      </p>
    </section>
    <DataFlowNotice
      v-if="notice.route.length"
      heading="h3"
      :title="t('chat.privacy.routeTitle')"
      class="chat-privacy__route"
    >
      <p v-for="s in notice.route" :key="s.key">{{ t(`chat.privacy.${s.key}`, s.params) }}</p>
    </DataFlowNotice>
    <section class="chat-privacy__kept">
      <h3 class="chat-privacy__heading">{{ t('chat.privacy.keptTitle') }}</h3>
      <ul>
        <li v-for="s in notice.kept" :key="s.key">{{ t(`chat.privacy.${s.key}`, s.params) }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.chat-privacy {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.chat-privacy section {
  min-width: 0;
}
/* The dialog's size of words, in the notice's shape. */
.chat-privacy .chat-privacy__route {
  font-size: inherit;
  line-height: inherit;
}
.chat-privacy__heading {
  margin: 0 0 4px;
  font-size: var(--app-text-sm);
  font-weight: var(--app-weight-strong);
  color: var(--el-text-color-primary);
}
.chat-privacy ul {
  margin: 0;
  padding-left: 18px;
}
.chat-privacy p {
  margin: 0 0 4px;
}
.chat-privacy p.chat-privacy__readers-note {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
}
.chat-privacy p:last-child {
  margin-bottom: 0;
}
</style>
