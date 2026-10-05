<script setup lang="ts">
// A group's peer evaluation on its work's page, for those who grade
// (peer_review.results for the one group): its members' evaluations, what
// each received and their factor in words, the score it gives beside the
// group's, flags and who has written nothing, with the way to every group's
// results, where it is counted in grades. Nothing is shown where the
// assignment has no peer form, or the group's circle is beyond the caller's
// reach.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import { useAsync } from '@/composables/useAsync'
import AsyncState from '@/components/AsyncState.vue'
import FairShareExplainer from './FairShareExplainer.vue'
import PeerGroupResults from './PeerGroupResults.vue'

const props = defineProps<{ courseId: string; assignmentId: string; groupId: string }>()
const { t } = useI18n()

const state = useAsync(
  async () => {
    // Asked first, so that an assignment without a form costs no refusal.
    const f = await read('peer_form.get', { course_id: props.courseId, assignment_id: props.assignmentId })
    if (!f.form) return null
    return read('peer_review.results', {
      course_id: props.courseId,
      assignment_id: props.assignmentId,
      group_id: props.groupId,
    })
  },
  { watch: [() => props.assignmentId, () => props.groupId], keepData: true },
)
const data = computed(() => state.data.value ?? null)
const group = computed(() => data.value?.groups?.find((g) => g.group_id === props.groupId) ?? null)
/** A refusal to read it (outside the caller's reach) shows nothing, as no form does. */
const hidden = computed(
  () => !!state.error.value?.isForbidden || (!state.loading.value && !state.error.value && !group.value),
)

defineExpose({ reload: () => state.reload() })
</script>

<template>
  <section v-if="!hidden" class="app-card peer-panel" data-test="peer-submission-panel">
    <h2 class="app-card__title">
      <span>{{ t('peer.title') }}</span>
      <router-link :to="{ name: 'course-assignment-peer', params: { courseId, assignmentId } }" class="peer-panel__all">
        {{ t('peer.panel.all') }}
      </router-link>
    </h2>
    <AsyncState :loading="state.loading.value && !data" :error="state.error.value" @retry="state.reload">
      <template v-if="data && group">
        <PeerGroupResults :course-id="courseId" :form="data.form" :group="group" :work-link="false" heading="h3" />
        <el-collapse class="peer-panel__fair">
          <el-collapse-item :title="t('peer.fair.title')" name="fair">
            <FairShareExplainer :form="data.form" :group-score="group.group_score" :points="group.points_possible" />
          </el-collapse-item>
        </el-collapse>
      </template>
    </AsyncState>
  </section>
</template>

<style scoped>
.peer-panel__fair {
  margin-top: 8px;
}
.peer-panel__all {
  font-size: var(--app-text-sm);
  font-weight: 400;
}
</style>
