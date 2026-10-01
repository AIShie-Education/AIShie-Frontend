<script setup lang="ts">
// The exports this browser remembers for the caller, newest first, until
// their files are deleted: what each was about and held, and its files to
// download again, each from a new link. Core has no list of them; this is
// what this browser kept. Taking one off the list forgets it here alone: its
// files stay until they are deleted, and its record in Core for good.
import { useI18n } from 'vue-i18n'
import ExportFiles from './ExportFiles.vue'
import ExportSummary from './ExportSummary.vue'
import type { RememberedExport } from './conversationExport'

defineProps<{ list: readonly RememberedExport[] }>()
const emit = defineEmits<{ forget: [exportId: string]; gone: [exportId: string] }>()
const { t } = useI18n()
</script>

<template>
  <section class="app-card recent-exports" :aria-labelledby="'recent-exports-title'">
    <h2 id="recent-exports-title" class="app-card__title">{{ t('auditExport.recent.title') }}</h2>
    <p class="app-muted recent-exports__note">{{ t('auditExport.recent.note') }}</p>
    <ol class="recent-exports__list">
      <li v-for="r in list" :key="r.export_id" class="recent-export" :data-export="r.export_id">
        <ExportSummary :record="r" compact />
        <ExportFiles
          class="recent-export__files"
          :export-id="r.export_id"
          :files="r.files"
          :expires-at="r.expires_at"
          compact
          @gone="emit('gone', r.export_id)"
        />
        <div class="recent-export__actions">
          <el-button link type="info" size="small" class="recent-export__forget" @click="emit('forget', r.export_id)">
            {{ t('auditExport.recent.forget') }}
          </el-button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.recent-exports__note {
  margin: -8px 0 16px;
  font-size: 13px;
  line-height: 1.5;
}
.recent-exports__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.recent-export {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
}
.recent-export__files {
  margin-top: 12px;
}
.recent-export__actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}
</style>
