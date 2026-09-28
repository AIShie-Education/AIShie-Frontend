<script setup lang="ts">
// What is left of something an administrator purged (document.purge): who
// purged it, when and why, and that its text and file are gone. Shown in place
// of the content and the download, to everyone who reads it.
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  purge: { at: string; by_actor_id: string; reason: string }
  /** The whole document, or one version of it. */
  of: 'document' | 'version'
}>()
const { t } = useI18n()
const course = useCourseStore()
const session = useSessionStore()
onMounted(() => void course.ensureMembers())

/** Who purged it: the caller, a member of the course by their account, or an administrator. */
const who = computed(() => {
  const id = props.purge.by_actor_id
  if (id === session.me?.id) return t('materials.document.tombstone.you')
  for (const m of course.members.values()) if (m.actor_id === id) return m.display_name
  return t('materials.document.tombstone.anAdministrator')
})
const line = computed(() =>
  t(`materials.document.tombstone.${props.of}`, { time: formatDateTime(props.purge.at), who: who.value }),
)
</script>

<template>
  <div class="tombstone" :class="`tombstone--${of}`" role="note">
    <el-icon class="tombstone__icon"><Delete /></el-icon>
    <div class="tombstone__body">
      <p class="tombstone__line">
        <el-tag type="danger" size="small" effect="dark" disable-transitions>{{
          t('materials.document.tombstone.tag')
        }}</el-tag>
        <span>{{ line }}</span>
      </p>
      <p class="tombstone__why">{{ t('materials.document.tombstone.why', { reason: purge.reason }) }}</p>
      <p class="tombstone__gone">{{ t('materials.document.tombstone.gone') }}</p>
    </div>
  </div>
</template>

<style scoped>
.tombstone {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: var(--app-radius-item);
  border: 1px dashed var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}
.tombstone__icon {
  color: var(--el-color-danger);
  margin-top: 3px;
  flex-shrink: 0;
}
.tombstone__body {
  min-width: 0;
}
.tombstone__line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-weight: 500;
  line-height: 1.5;
}
.tombstone__why {
  margin: 4px 0 0;
  line-height: 1.5;
  word-break: break-word;
}
.tombstone__gone {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
