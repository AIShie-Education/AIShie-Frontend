<script setup lang="ts">
// What an agent is here, in three points: registered here, run elsewhere by a
// runtime, and acting only as its owner's delegate. Three rows between rules,
// each its point and its words, not three columns under an icon each.
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const POINTS = ['here', 'runtime', 'delegate'] as const
</script>

<template>
  <section class="app-card agents-about">
    <h2 class="app-card__title">{{ t('agents.about.title') }}</h2>
    <ul class="agents-about__points">
      <li v-for="p in POINTS" :key="p">
        <strong>{{ t(`agents.about.${p}.title`) }}</strong>
        <p>{{ t(`agents.about.${p}.body`) }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* The section's own width decides how its points sit, not the window's. */
.agents-about {
  container-type: inline-size;
}
.agents-about__points {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: var(--app-rule);
}
/* A point a row: its name at the left, its words beside it, at the measure. */
.agents-about__points li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
  gap: var(--app-space-xs) var(--app-space-xl);
  padding: var(--app-space-md) 0;
  border-bottom: var(--app-rule);
}
.agents-about__points strong {
  line-height: var(--app-lh-text);
}
.agents-about__points p {
  margin: 0;
  max-width: var(--app-measure);
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
  color: var(--app-ink-2);
}
/* Under its name where the section is narrow. */
@container (max-width: 639px) {
  .agents-about__points li {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
