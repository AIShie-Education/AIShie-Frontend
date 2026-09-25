<script setup lang="ts">
// The course's own description (course.get, held by the course store).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import MarkdownView from '@/components/MarkdownView.vue'
import TimeText from '@/components/TimeText.vue'

const course = useCourseStore()
const { t } = useI18n()

const description = computed(() => course.course?.description?.trim() ?? '')
// A long description is folded, so that what needs doing is not pushed down.
const long = computed(() => description.value.length > 600 || description.value.split('\n').length > 12)
const expanded = ref(false)
</script>

<template>
  <section class="app-card about">
    <h2 class="app-card__title">{{ t('overview.about.title') }}</h2>
    <el-alert
      v-if="course.course?.status === 'draft'"
      type="info"
      :closable="false"
      show-icon
      class="about__draft"
      :title="t('common.draftCourse')"
    />
    <div class="about__desc" :class="{ 'is-folded': long && !expanded }">
      <MarkdownView :source="description" :empty="t('overview.about.noDescription')" />
    </div>
    <el-button v-if="long" link type="primary" class="about__toggle" @click="expanded = !expanded">
      {{ expanded ? t('overview.about.showLess') : t('overview.about.showMore') }}
    </el-button>
    <p v-if="course.course?.created_at" class="about__meta app-muted">
      {{ t('overview.about.created') }}
      <TimeText :value="course.course.created_at" />
    </p>
  </section>
</template>

<style scoped>
.about__draft {
  margin-bottom: 12px;
}
.about__desc {
  position: relative;
  overflow-wrap: anywhere;
}
.about__desc.is-folded {
  max-height: 220px;
  overflow: hidden;
}
.about__desc.is-folded::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 56px;
  background: linear-gradient(to bottom, transparent, var(--el-bg-color));
}
.about__toggle {
  margin-top: 4px;
}
.about__meta {
  margin: 12px 0 0;
  font-size: 12px;
}
</style>
