<script setup lang="ts">
// A member's grade given from their group's: the group, the group's score
// and the member's own, and how the one came from the other (the group's
// score, a score of their own, plus or minus, or moved by peer evaluation),
// with the grader's reason, which the member reads too, and who set it,
// which Core gives those who grade alone. The feedback and files are the
// group's, every member's to read. Those who grade adjust the member here;
// one whose seat does not reach every member of the work is told that the
// group is regraded by someone else.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Decimal, Grade } from '@/api/types'
import StatusTag from '@/components/StatusTag.vue'
import AdjustmentText from '@/views/course/submissions/components/AdjustmentText.vue'
import { isGraderAdjustment } from '@/views/course/submissions/components/groupGrading'
import ScoreText from './ScoreText.vue'

const props = defineProps<{
  grade: Grade
  outOf: Decimal | null
  /** The member reading their own grade. */
  mine?: boolean
  canAdjust?: boolean
  adjustNeedsApproval?: boolean
  /** Some member of the work is outside the caller's reach: the group's regrade is not theirs. */
  regradeUnreached?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ adjust: [] }>()
const { t } = useI18n()

const group = computed(() => props.grade.group!)
const adjusted = computed(() => isGraderAdjustment(group.value.adjustment))
</script>

<template>
  <section class="app-card group-grade">
    <h2 class="app-card__title">
      <span>{{ t('groupGrading.card.title') }}</span>
      <el-button v-if="canAdjust" size="small" :disabled="disabled" @click="emit('adjust')">
        <el-icon><EditPen /></el-icon>
        <span>{{ t('groupGrading.card.adjust') }}</span>
        <StatusTag
          v-if="adjustNeedsApproval"
          vocab="level"
          value="confirm_required"
          size="small"
          class="group-grade__approval"
        />
      </el-button>
    </h2>
    <dl class="group-grade__facts">
      <div>
        <dt>{{ t('groupGrading.card.group') }}</dt>
        <dd>{{ group.group_name ?? t('groupGrading.members.groupWork') }}</dd>
      </div>
      <div>
        <dt>{{ t('groupGrading.card.groupScore') }}</dt>
        <dd><ScoreText :score="group.score" :out-of="outOf" /></dd>
      </div>
      <div>
        <dt>{{ mine ? t('groupGrading.card.yourScore') : t('groupGrading.card.memberScore') }}</dt>
        <dd><ScoreText :score="grade.score" :out-of="outOf" /></dd>
      </div>
      <div class="group-grade__wide">
        <dt>{{ t('groupGrading.card.how') }}</dt>
        <dd :class="{ 'is-adjusted': adjusted }">
          <AdjustmentText :adjustment="group.adjustment" reason :by="!mine" detail />
        </dd>
      </div>
    </dl>
    <p class="app-form-hint group-grade__shared">
      {{ mine ? t('groupGrading.card.sharedMine') : t('groupGrading.card.shared') }}
    </p>
    <p v-if="regradeUnreached" class="app-form-hint group-grade__unreached">
      {{ t('groupGrading.regrade.unreached') }}
    </p>
  </section>
</template>

<style scoped>
.group-grade__approval {
  margin-left: 6px;
}
.group-grade__facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--app-space-md) var(--app-space-lg);
  margin: 0;
}
.group-grade__facts dt {
  font-size: var(--app-text-xs);
  color: var(--app-ink-3);
  margin-bottom: var(--app-space-xs);
}
.group-grade__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.group-grade__wide {
  grid-column: 1 / -1;
}
/* Set apart from the group's score: how, in the strong weight; the reason after it as it is. */
.group-grade__facts dd.is-adjusted :deep(.adjustment-text__how) {
  font-weight: var(--app-weight-strong);
}
.group-grade__shared {
  margin: var(--app-space-md) 0 0;
}
.group-grade__unreached {
  margin: var(--app-space-sm) 0 0;
}
</style>
