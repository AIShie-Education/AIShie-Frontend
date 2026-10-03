<script setup lang="ts">
// One preset in full: what a member seated from it starts with.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Box, OfficeBuilding } from '@element-plus/icons-vue'
import { PERMS, type Preset } from '@/api/types'
import AppTag from '@/components/AppTag.vue'
import IdText from '@/components/IdText.vue'
import PermEditor from '@/components/PermEditor.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useBackCloses } from '@/composables/useBackCloses'
import { DRAWER_SIZE, allowedCount, isBuiltin, permLevels, presetDescription, presetLabel } from './presets'

const open = defineModel<boolean>({ default: false })
// Back closes it, on a phone (where it is full width, DRAWER_SIZE) as on a desktop: it is laid over
// the page, which it never outlives.
useBackCloses(open, () => (open.value = false))
const props = defineProps<{ preset: Preset | null; deptName: string | null; canEdit: boolean }>()
const emit = defineEmits<{ edit: [preset: Preset]; copy: [preset: Preset] }>()
const { t } = useI18n()

const builtin = computed(() => !!props.preset && isBuiltin(props.preset))
const levels = computed(() => (props.preset ? permLevels(props.preset) : {}))
const description = computed(() => (props.preset ? presetDescription(props.preset) : ''))
</script>

<template>
  <!-- append-to-body: out of AppLayout's subtree, whose own nav-drawer style
       (no padding, aside background) would otherwise reach this drawer too. -->
  <el-drawer
    v-model="open"
    append-to-body
    :size="DRAWER_SIZE"
    :title="preset ? t('adminSetup.presets.drawer.title', { name: presetLabel(preset) }) : ''"
    class="preset-drawer"
  >
    <template v-if="preset">
      <div class="preset-drawer__tags">
        <AppTag v-if="builtin" variant="outline" :icon="Box">
          {{ t('adminSetup.presets.builtin') }}
        </AppTag>
        <AppTag v-else variant="outline" :icon="OfficeBuilding">
          {{ deptName ?? t('adminSetup.presets.own') }}
        </AppTag>
        <span class="app-muted preset-drawer__count">{{
          t('adminSetup.presets.allowed', { n: allowedCount(preset), total: PERMS.length })
        }}</span>
      </div>

      <p class="preset-drawer__desc" :class="{ 'app-muted': !description }">
        {{ description || t('adminSetup.presets.noDescription') }}
      </p>

      <dl class="preset-drawer__facts">
        <dt>{{ t('adminSetup.presets.drawer.name') }}</dt>
        <dd>
          <code class="preset-drawer__key">{{ preset.name }}</code>
        </dd>
        <dt>{{ t('adminSetup.presets.role') }}</dt>
        <dd><StatusTag vocab="role" :value="preset.role" /></dd>
        <dt>{{ t('adminSetup.presets.studentScope') }}</dt>
        <dd><StatusTag vocab="scope" :value="preset.student_scope" /></dd>
        <dt>{{ t('adminSetup.presets.assignmentScope') }}</dt>
        <dd><StatusTag vocab="scope" :value="preset.assignment_scope" /></dd>
        <dt>{{ t('adminSetup.presets.drawer.department') }}</dt>
        <dd>
          <template v-if="builtin">{{ t('adminSetup.presets.builtinHelp') }}</template>
          <template v-else>{{ deptName ?? '—' }}</template>
        </dd>
        <dt>{{ t('adminSetup.presets.drawer.id') }}</dt>
        <dd><IdText :id="preset.id" /></dd>
      </dl>

      <el-alert
        v-if="builtin"
        type="info"
        :closable="false"
        show-icon
        :title="t('adminSetup.presets.drawer.builtinNote')"
        class="preset-drawer__note"
      />

      <div v-if="canEdit" class="preset-drawer__actions">
        <el-button v-if="builtin" @click="emit('copy', preset)">
          <el-icon><CopyDocument /></el-icon>
          <span>{{ t('adminSetup.presets.drawer.copy') }}</span>
        </el-button>
        <template v-else>
          <el-button type="primary" @click="emit('edit', preset)">
            <el-icon><Edit /></el-icon>
            <span>{{ t('adminSetup.presets.drawer.edit') }}</span>
          </el-button>
          <el-button @click="emit('copy', preset)">
            <el-icon><CopyDocument /></el-icon>
            <span>{{ t('adminSetup.presets.drawer.copy') }}</span>
          </el-button>
        </template>
      </div>

      <h3 class="preset-drawer__heading">{{ t('adminSetup.presets.drawer.perms') }}</h3>
      <PermEditor :model-value="levels" readonly />
    </template>
  </el-drawer>
</template>

<style scoped>
.preset-drawer__tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.preset-drawer__count {
  font-size: 13px;
}
.preset-drawer__desc {
  margin: 12px 0 16px;
  line-height: 1.6;
  word-break: break-word;
}
.preset-drawer__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0 0 16px;
  font-size: 14px;
  align-items: center;
}
.preset-drawer__facts dt {
  color: var(--el-text-color-secondary);
}
.preset-drawer__facts dd {
  margin: 0;
  min-width: 0;
  word-break: break-word;
}
.preset-drawer__key {
  font-family: var(--app-font-mono);
  font-size: 13px;
}
.preset-drawer__note {
  margin-bottom: 12px;
}
.preset-drawer__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.preset-drawer__actions .el-button + .el-button {
  margin-left: 0;
}
.preset-drawer__heading {
  margin: 20px 0 4px;
  font-size: 15px;
  font-weight: 600;
}
</style>
