<script setup lang="ts">
// Permission presets (preset.list): the built-ins, and one department's own
// beside them. Administrators make a department preset (preset.create) and
// replace one's body (preset.update); built-ins are fixed. A preset is copied
// onto a seat when a member is added, so editing one changes nobody seated.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Box, OfficeBuilding } from '@element-plus/icons-vue'
import { read } from '@/api/http'
import { PERMS, type Preset } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useSessionStore } from '@/stores/session'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import PresetDrawer from './setup/PresetDrawer.vue'
import PresetFormDialog from './setup/PresetFormDialog.vue'
import PresetMatrix from './setup/PresetMatrix.vue'
import { allowedCount, hasOwnLabel, isBuiltin, presetDescription, presetLabel, sortPresets } from './setup/presets'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const queryDept = () => (typeof route.query.dept === 'string' ? route.query.dept : '')
const deptId = ref<string>(queryDept())
watch(
  () => route.query.dept,
  () => {
    if (queryDept() !== deptId.value) deptId.value = queryDept()
  },
)
watch(deptId, (v) => {
  if (v !== queryDept()) void router.replace({ query: { ...route.query, dept: v || undefined } })
})

const departments = useAsync(() => read('department.list', {}).then((o) => o.departments ?? []), { keepData: true })
const deptList = computed(() => departments.data.value ?? [])
const deptNames = computed(() => new Map(deptList.value.map((d) => [d.id, d.name])))
function deptName(id: string | null | undefined): string | null {
  return id ? (deptNames.value.get(id) ?? null) : null
}

const presets = useAsync(
  () => read('preset.list', { dept_id: deptId.value || undefined }).then((o) => sortPresets(o.presets ?? [])),
  { watch: [deptId], keepData: true },
)
const list = computed(() => presets.data.value ?? [])
const ownCount = computed(() => list.value.filter((p) => !isBuiltin(p)).length)
const canWrite = computed(() => session.isAdmin)

// --- Details ----------------------------------------------------------------
const drawerOpen = ref(false)
const shownId = ref<string | null>(null)
// Kept by id, so that after a save the drawer shows what was saved.
const shown = computed<Preset | null>(() => list.value.find((p) => p.id === shownId.value) ?? null)
function openDetails(p: Preset) {
  shownId.value = p.id
  drawerOpen.value = true
}

// --- Making and editing -----------------------------------------------------
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formPreset = ref<Preset | null>(null)

function startCreate(from: Preset | null = null) {
  formMode.value = 'create'
  formPreset.value = from
  drawerOpen.value = false
  formOpen.value = true
}
function startEdit(p: Preset) {
  formMode.value = 'edit'
  formPreset.value = p
  drawerOpen.value = false
  formOpen.value = true
}
function onSaved(savedDept: string | null) {
  if (savedDept && savedDept !== deptId.value) deptId.value = savedDept
  else void presets.reload()
}
</script>

<template>
  <div>
    <PageHeader :title="t('adminSetup.presets.title')" :subtitle="t('adminSetup.presets.subtitle')">
      <el-button v-if="canWrite" type="primary" @click="startCreate()">
        <el-icon><Plus /></el-icon>
        <span>{{ t('adminSetup.presets.new') }}</span>
      </el-button>
    </PageHeader>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      :title="t('adminSetup.presets.explain')"
      class="presets-explain"
    />

    <div class="app-toolbar presets-toolbar">
      <label class="presets-toolbar__label" for="presets-dept">{{ t('adminSetup.presets.department') }}</label>
      <el-select
        id="presets-dept"
        v-model="deptId"
        filterable
        clearable
        :loading="departments.loading.value"
        :placeholder="t('adminSetup.presets.builtinOnly')"
        class="presets-toolbar__select"
      >
        <el-option v-for="d in deptList" :key="d.id" :value="d.id" :label="d.name" />
      </el-select>
      <span class="app-toolbar__spacer" />
      <el-button
        :loading="presets.loading.value"
        circle
        :aria-label="t('common.actions.refresh')"
        @click="presets.reload"
      >
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>

    <AsyncState
      :loading="presets.loading.value && !presets.data.value"
      :error="presets.error.value"
      :empty="!list.length"
      :empty-text="t('adminSetup.presets.empty')"
      overlay
      @retry="presets.reload"
    >
      <section class="app-card">
        <h2 class="app-card__title">{{ t('adminSetup.presets.list') }}</h2>
        <p v-if="!deptId" class="app-form-hint presets-hint">{{ t('adminSetup.presets.pickDepartment') }}</p>
        <p v-else-if="!ownCount && !presets.loading.value" class="app-form-hint presets-hint">
          {{ t('adminSetup.presets.noOwn', { name: deptName(deptId) ?? deptId }) }}
        </p>
        <div class="presets-grid">
          <article v-for="p in list" :key="p.id" class="preset-card" :class="{ 'is-own': !isBuiltin(p) }">
            <header class="preset-card__head">
              <span class="preset-card__name">{{ presetLabel(p) }}</span>
              <code v-if="hasOwnLabel(p)" class="preset-card__key">{{ p.name }}</code>
              <AppTag v-if="isBuiltin(p)" variant="outline" :icon="Box">
                {{ t('adminSetup.presets.builtin') }}
              </AppTag>
              <AppTag v-else variant="outline" :icon="OfficeBuilding" class="preset-card__dept">
                {{ deptName(p.dept_id) ?? t('adminSetup.presets.own') }}
              </AppTag>
            </header>
            <p class="preset-card__desc" :class="{ 'app-muted': !presetDescription(p) }">
              {{ presetDescription(p) || t('adminSetup.presets.noDescription') }}
            </p>
            <div class="preset-card__facts">
              <StatusTag vocab="role" :value="p.role" />
              <span class="preset-card__scope">
                {{ t('adminSetup.presets.studentsLine', { scope: t(`enums.scope.${p.student_scope}`) }) }}
              </span>
              <span class="preset-card__scope">
                {{ t('adminSetup.presets.assignmentsLine', { scope: t(`enums.scope.${p.assignment_scope}`) }) }}
              </span>
            </div>
            <footer class="preset-card__foot">
              <span class="app-muted">{{
                t('adminSetup.presets.allowed', { n: allowedCount(p), total: PERMS.length })
              }}</span>
              <span class="preset-card__actions">
                <el-button v-if="canWrite && !isBuiltin(p)" link type="primary" @click="startEdit(p)">
                  {{ t('adminSetup.presets.drawer.edit') }}
                </el-button>
                <el-button link type="primary" @click="openDetails(p)">{{ t('adminSetup.presets.details') }}</el-button>
              </span>
            </footer>
          </article>
        </div>
      </section>

      <section class="app-card">
        <h2 class="app-card__title">{{ t('adminSetup.presets.matrix') }}</h2>
        <p class="app-form-hint presets-hint">{{ t('adminSetup.presets.matrixHint') }}</p>
        <PresetMatrix :presets="list" :dept-name="deptName" @open="openDetails" />
      </section>
    </AsyncState>

    <PresetDrawer
      v-model="drawerOpen"
      :preset="shown"
      :dept-name="deptName(shown?.dept_id)"
      :can-edit="canWrite"
      @edit="startEdit"
      @copy="startCreate"
    />
    <PresetFormDialog
      v-model="formOpen"
      :mode="formMode"
      :preset="formPreset"
      :dept-id="deptId || null"
      :departments="deptList"
      :presets="list"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.presets-explain {
  margin-bottom: 16px;
}
.presets-toolbar__label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.presets-toolbar__select {
  width: 300px;
  max-width: 100%;
}
.presets-hint {
  margin: -6px 0 12px;
}
.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.preset-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--app-radius-card);
  background: var(--el-bg-color);
  min-width: 0;
}
.preset-card.is-own {
  border-color: var(--el-color-primary-light-7);
}
.preset-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.preset-card__name {
  font-weight: 600;
  font-size: 15px;
  word-break: break-word;
}
.preset-card__key {
  font-family: var(--app-font-mono);
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 1px 5px;
}
.preset-card__dept {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-card__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.preset-card__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.preset-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  font-size: 12px;
}
.preset-card__actions {
  display: flex;
  gap: 4px;
}
</style>
