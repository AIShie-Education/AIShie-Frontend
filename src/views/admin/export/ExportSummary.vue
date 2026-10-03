<script setup lang="ts">
// What an export holds and what it was about: the course or department (or
// the whole site), whose conversations alone and which days; when it was
// made and when its files are deleted; and how many conversations, messages
// (withdrawn ones among them), files described, proposals never posted, and
// how much text.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatBytes } from '@/utils/format'
import TimeText from '@/components/TimeText.vue'
import { count, spanWords, type RememberedExport } from './conversationExport'

const props = defineProps<{ record: RememberedExport; compact?: boolean }>()
const { t } = useI18n()

const scopeWords = computed(() => {
  const r = props.record
  if (r.scope === 'site') return t('auditExport.summary.site')
  const kind = t(`auditExport.scope.${r.scope === 'department' ? 'department' : 'course'}`)
  return r.scope_label ? t('auditExport.summary.scoped', { kind, label: r.scope_label }) : kind
})
const span = computed(() => spanWords(props.record.from, props.record.before))
</script>

<template>
  <div class="export-summary" :class="{ 'is-compact': compact }">
    <p class="export-summary__about">
      <span class="export-summary__scope">{{ scopeWords }}</span>
      <span v-if="record.participant_label" class="export-summary__participant"
        >{{ t('common.sep') }}{{ t('auditExport.summary.participant', { who: record.participant_label }) }}</span
      >
      <span class="export-summary__span">{{ t('common.sep') }}{{ span }}</span>
    </p>
    <dl class="export-summary__counts">
      <div>
        <dt>{{ t('auditExport.summary.conversations') }}</dt>
        <dd class="export-summary__n" data-count="conversations">{{ count(record.conversations) }}</dd>
      </div>
      <div>
        <dt>{{ t('auditExport.summary.messages') }}</dt>
        <dd class="export-summary__n" data-count="messages">
          {{ count(record.messages) }}
          <span v-if="record.retracted" class="export-summary__of">
            {{ t('auditExport.summary.withdrawn', { n: count(record.retracted) }) }}
          </span>
        </dd>
      </div>
      <div>
        <dt>{{ t('auditExport.summary.proposals') }}</dt>
        <dd class="export-summary__n" data-count="proposals">{{ count(record.proposals) }}</dd>
      </div>
      <div v-if="!compact">
        <dt>{{ t('auditExport.summary.attachments') }}</dt>
        <dd class="export-summary__n" data-count="attachments">{{ count(record.attachments) }}</dd>
      </div>
      <div v-if="!compact">
        <dt>{{ t('auditExport.summary.text') }}</dt>
        <dd class="export-summary__n" data-count="text">{{ formatBytes(record.text_bytes) }}</dd>
      </div>
    </dl>
    <p class="export-summary__times">
      <span>
        {{ t('auditExport.summary.asOf') }}
        <TimeText :value="record.as_of" />
      </span>
      <span>
        {{ t('auditExport.summary.expiresAt') }}
        <TimeText :value="record.expires_at" cutoff />
      </span>
    </p>
  </div>
</template>

<style scoped>
.export-summary__about {
  margin: 0 0 12px;
  line-height: var(--app-lh-ui);
  overflow-wrap: anywhere;
}
.export-summary__scope {
  font-weight: var(--app-weight-strong);
}
.export-summary__counts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.is-compact .export-summary__counts {
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}
.export-summary__counts dt {
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.export-summary__counts dd {
  margin: 2px 0 0;
}
.export-summary__n {
  font-size: var(--app-text-2xl);
  font-weight: var(--app-heading-weight);
  font-variant-numeric: tabular-nums;
}
.is-compact .export-summary__n {
  font-size: var(--app-text-lg);
}
.export-summary__of {
  display: block;
  font-size: var(--app-text-xs);
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.export-summary__times {
  margin: 12px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
</style>
