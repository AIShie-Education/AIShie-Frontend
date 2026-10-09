<script setup lang="ts">
// A group assignment's peer evaluation, on its page, for its teaching staff
// (peer_form.get): how members evaluate each other, when, how much it
// counts, and what students see, in words; whoever writes assignments sets
// it up and changes it here (PeerFormDialog), and whoever grades goes on to
// its results (PeerResultsView), where it is counted in grades.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { read } from '@/api/http'
import type { Assignment } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useCourseStore } from '@/stores/course'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import StatusTag from '@/components/StatusTag.vue'
import PeerFormDialog from './PeerFormDialog.vue'
import PeerFormSummary from './PeerFormSummary.vue'
import { formCounts } from './peer'

const props = defineProps<{ courseId: string; assignment: Assignment }>()
const { t } = useI18n()
const course = useCourseStore()

const state = useAsync(() => read('peer_form.get', { course_id: props.courseId, assignment_id: props.assignment.id }), {
  watch: [() => props.assignment.id],
  keepData: true,
})
const form = computed(() => state.data.value?.form ?? null)

const writer = computed(() => course.can('assignment_write'))
const grader = computed(() => course.can('grade_submit') || course.can('grade_post'))

const dialogOpen = ref(false)
/** A change asked for here that waits for approval. */
const proposed = ref(false)
function onSaved(r: { status: 'executed' | 'proposed' }) {
  proposed.value = r.status === 'proposed'
  void state.reload()
}

defineExpose({ reload: () => state.reload() })
</script>

<template>
  <section class="app-card peer-card" data-test="peer-settings">
    <h2 class="app-card__title">
      <span>{{ t('peer.title') }}</span>
      <AppTag v-if="form && !form.enabled" tone="wait">{{ t('peer.summary.off') }}</AppTag>
      <AppTag v-else-if="form && formCounts(form)" variant="outline">{{ t('peer.settings.counts') }}</AppTag>
    </h2>
    <AsyncState :loading="state.loading.value && !state.data.value" :error="state.error.value" @retry="state.reload">
      <AppNote v-if="proposed" class="peer-card__note" closable @close="proposed = false">
        {{ t('peer.settings.proposed') }}
        <router-link :to="{ name: 'course-my-actions', params: { courseId } }">{{
          t('peer.settings.myActions')
        }}</router-link>
      </AppNote>
      <template v-if="form">
        <PeerFormSummary :form="form" />
        <p v-if="form.in_use" class="app-form-hint peer-card__in-use">{{ t('peer.settings.inUse') }}</p>
      </template>
      <p v-else class="peer-card__none">{{ t('peer.settings.none') }}</p>
      <div v-if="(writer && course.writable) || (form && grader)" class="peer-card__actions">
        <el-button v-if="writer" :disabled="!course.writable" @click="dialogOpen = true">
          <el-icon><component :is="form ? 'Edit' : 'Plus'" /></el-icon>
          <span>{{ form ? t('common.actions.edit') : t('peer.settings.setUp') }}</span>
        </el-button>
        <router-link
          v-if="form && grader"
          :to="{ name: 'course-assignment-peer', params: { courseId, assignmentId: assignment.id } }"
        >
          <el-button>
            <el-icon><DataAnalysis /></el-icon>
            <span>{{ t('peer.settings.results') }}</span>
          </el-button>
        </router-link>
        <StatusTag v-if="writer && course.needsApproval('assignment_write')" vocab="level" value="confirm_required" />
      </div>
    </AsyncState>
    <PeerFormDialog
      v-if="writer"
      v-model:visible="dialogOpen"
      :course-id="courseId"
      :assignment-id="assignment.id"
      :due-at="assignment.due_at"
      :form="form"
      @saved="onSaved"
      @stale="state.reload"
    />
  </section>
</template>

<style scoped>
.peer-card .app-card__title {
  justify-content: flex-start;
  gap: 8px;
}
.peer-card__note {
  margin-bottom: 12px;
}
.peer-card__note a {
  margin-left: 6px;
}
.peer-card__none {
  margin: 0;
  font-size: var(--app-text-sm);
  color: var(--app-ink-2);
  line-height: var(--app-lh-text);
}
.peer-card__in-use {
  margin: 8px 0 0;
}
.peer-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
</style>
