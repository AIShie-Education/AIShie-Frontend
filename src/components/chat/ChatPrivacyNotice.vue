<script setup lang="ts">
// The whole of what the chat says about a conversation's privacy (privacy.ts):
// who can read it, as Core says; where it goes to be answered; and what is
// kept of it. Shown in the pane's dialog, from "More" and the ⋯ menu.
import { useI18n } from 'vue-i18n'
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
    </section>
    <section class="chat-privacy__route">
      <h3 class="chat-privacy__heading">{{ t('chat.privacy.routeTitle') }}</h3>
      <p v-for="s in notice.route" :key="s.key">{{ t(`chat.privacy.${s.key}`, s.params) }}</p>
    </section>
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
  font-size: 13px;
  line-height: 1.6;
}
.chat-privacy section {
  min-width: 0;
}
.chat-privacy__heading {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.chat-privacy ul {
  margin: 0;
  padding-left: 18px;
}
.chat-privacy p {
  margin: 0 0 4px;
}
.chat-privacy p:last-child {
  margin-bottom: 0;
}
</style>
