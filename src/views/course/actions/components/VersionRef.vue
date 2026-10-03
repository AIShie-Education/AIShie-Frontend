<script setup lang="ts">
// A version of a document by its number, where the caller may list versions.
// For a proposal to publish one (`check`), also how it stands against what is
// published and the latest: approving an earlier version moves what everyone
// reads back to it, which the approver must see before saying yes.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IdText from '@/components/IdText.vue'
import { useLookup, useSpecs } from './lookups'

const props = defineProps<{
  courseId: string
  documentId?: string | null
  versionId: string
  /** Compare with the published and the latest version. */
  check?: boolean
  /** Say it in a sentence too, not only in tags. */
  explain?: boolean
}>()
const { t } = useI18n()
const specs = useSpecs()

const versions = useLookup(() => specs.versions(props.courseId, props.documentId))
const list = computed(() => versions.value?.value ?? [])
const version = computed(() => list.value.find((v) => v.id === props.versionId))
const published = computed(() => list.value.find((v) => v.published))
const latest = computed(() =>
  list.value.reduce<(typeof list.value)[number] | undefined>((a, v) => (!a || v.seq > a.seq ? v : a), undefined),
)

const isPublished = computed(() => !!version.value && published.value?.id === version.value.id)
/** Publishing it would put an earlier version back in front of readers. */
const rollsBack = computed(() => !!version.value && !!published.value && published.value.seq > version.value.seq)
const older = computed(() => !!version.value && !!latest.value && latest.value.seq > version.value.seq)
</script>

<template>
  <span class="version-ref">
    <span class="version-ref__line">
      <span v-if="version" class="version-ref__seq">{{ t('actions.summary.version', { seq: version.seq }) }}</span>
      <IdText v-if="!version || explain" :id="versionId" />
      <template v-if="check && version">
        <el-tag v-if="isPublished" size="small" type="info" effect="plain">{{
          t('actions.summary.publishedNow')
        }}</el-tag>
        <el-tag v-if="rollsBack" size="small" type="warning" effect="light">
          {{ t('actions.summary.rollsBack', { seq: published!.seq }) }}
        </el-tag>
        <el-tag v-else-if="older" size="small" type="warning" effect="plain">
          {{ t('actions.summary.olderThan', { seq: latest!.seq }) }}
        </el-tag>
      </template>
    </span>
    <span v-if="check && explain && version && (rollsBack || older)" class="version-ref__note">
      <el-icon><WarningFilled /></el-icon>
      <span>
        {{
          rollsBack
            ? t('actions.fields.publishRollsBack', { seq: version.seq, published: published!.seq })
            : t('actions.fields.publishOlder', { seq: version.seq, latest: latest!.seq })
        }}
      </span>
    </span>
  </span>
</template>

<style scoped>
.version-ref {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.version-ref__line {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.version-ref__seq {
  font-weight: 500;
}
.version-ref__note {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: var(--app-text-xs);
  line-height: var(--app-lh-ui);
  color: var(--el-color-warning);
}
.version-ref__note .el-icon {
  margin-top: 3px;
  flex-shrink: 0;
}
</style>
