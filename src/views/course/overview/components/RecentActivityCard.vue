<script setup lang="ts">
// The last few events of the course feed the caller may see, newest first,
// with the way into the whole feed.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AsyncState from '@/components/AsyncState.vue'
import EventItem from '@/views/course/activity/components/EventItem.vue'
import {
  hasOlder,
  mergeNewestFirst,
  newestWindow,
  olderWindow,
  runsOf,
} from '@/views/course/activity/components/feed'

const props = defineProps<{ courseId: string }>()
const course = useCourseStore()
const { t } = useI18n()

// At most SHOW rows; a run of the same thing (see runsOf) is one row, so a
// burst of one thing can leave a window with few rows: then up to FILL older
// windows are read as well.
const SHOW = 8
const FILL = 2
const WINDOW = { want: 12, limit: 60 }
onMounted(() => void course.ensureAssignments())
const feed = useAsync(async () => {
  const w = await newestWindow(props.courseId, WINDOW)
  let events = [...w.events].reverse()
  let floor = w.floor
  for (let i = 0; i < FILL && floor > 0 && runsOf(events).length <= SHOW; i++) {
    const more = await olderWindow(props.courseId, events, floor, WINDOW)
    events = mergeNewestFirst(events, more.events)
    floor = more.floor
  }
  return { events, older: await hasOlder(props.courseId, floor) }
})
const runs = computed(() => runsOf(feed.data.value?.events ?? []).slice(0, SHOW))
/** A run that reaches the oldest event loaded may go on beyond it. */
function moreLabel(i: number): string {
  const r = runs.value[i]
  const all = feed.data.value?.events ?? []
  const open = !!feed.data.value?.older && r.events[r.events.length - 1] === all[all.length - 1]
  const n = r.events.length - 1
  return t('activity.runMore', { n: open ? `${n}+` : n })
}
</script>

<template>
  <section class="app-card recent">
    <h2 class="app-card__title">
      <span>{{ t('overview.activity.title') }}</span>
      <router-link :to="{ name: 'course-activity', params: { courseId } }" class="recent__all">
        {{ t('overview.activity.all') }}
        <el-icon><ArrowRight /></el-icon>
      </router-link>
    </h2>
    <AsyncState
      :loading="feed.loading.value"
      :error="feed.error.value"
      :empty="!runs.length"
      :empty-text="t('overview.activity.none')"
      @retry="feed.reload"
    >
      <div class="recent__list">
        <EventItem v-for="(r, i) in runs" :key="r.key" :event="r.events[0]" :course-id="courseId" compact>
          <span v-if="r.events.length > 1" class="recent__more app-muted">{{ moreLabel(i) }}</span>
        </EventItem>
      </div>
    </AsyncState>
  </section>
</template>

<style scoped>
.recent__all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}
.recent__list {
  display: flex;
  flex-direction: column;
}
.recent__more {
  font-size: 12px;
}
.recent__list > * + * {
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
