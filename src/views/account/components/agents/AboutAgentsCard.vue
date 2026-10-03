<script setup lang="ts">
// What an agent is here, in three points: registered here, run elsewhere by a
// runtime, and acting only as its owner's delegate.
import { useI18n } from 'vue-i18n'
import AgentSeatIcon from '@/components/AgentSeatIcon.vue'

const { t } = useI18n()
</script>

<template>
  <section class="app-card agents-about">
    <h2 class="app-card__title">{{ t('agents.about.title') }}</h2>
    <ul class="agents-about__points">
      <li>
        <el-icon :size="20" class="agents-about__icon"><AgentSeatIcon /></el-icon>
        <div>
          <strong>{{ t('agents.about.here.title') }}</strong>
          <p>{{ t('agents.about.here.body') }}</p>
        </div>
      </li>
      <li>
        <el-icon :size="20" class="agents-about__icon"><Connection /></el-icon>
        <div>
          <strong>{{ t('agents.about.runtime.title') }}</strong>
          <p>{{ t('agents.about.runtime.body') }}</p>
        </div>
      </li>
      <li>
        <el-icon :size="20" class="agents-about__icon"><Lock /></el-icon>
        <div>
          <strong>{{ t('agents.about.delegate.title') }}</strong>
          <p>{{ t('agents.about.delegate.body') }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* The card's own width decides how its points sit, not the window's. */
.agents-about {
  container-type: inline-size;
}
.agents-about__points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.agents-about__points li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.agents-about__points p {
  margin: 4px 0 0;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--el-text-color-regular);
}
.agents-about__icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--el-color-primary);
}
/* Three side by side while each keeps 200 px or more. */
@container (max-width: 639px) {
  .agents-about__points {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
}
</style>
