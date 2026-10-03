<script setup lang="ts">
// The departments as a tree (department.list_tree), and what the caller may
// do with each. A platform administrator sees the whole tree and makes
// departments at its top; a department's administrator sees the departments
// they administer and everything beneath them, each where it is in the tree.
//
// What is offered follows the flags Core gives each department: beneath one
// the caller administers they make departments and see its courses and
// administrators; one they manage (an appointment of theirs is above it) they
// rename, move and staff. Nobody reshapes or staffs their own appointment's
// department: whoever is above it does.
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { User } from '@element-plus/icons-vue'
import type { DepartmentNode } from '@/api/types'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { useContainerNarrow, useTableRelayout } from '@/composables/useContainerWidth'
import { useSessionStore } from '@/stores/session'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import IdText from '@/components/IdText.vue'
import PageHeader from '@/components/PageHeader.vue'
import RefreshButton from '@/components/RefreshButton.vue'
import { deptActions, roomBeneath, treeRows, type DeptAction, type DeptTreeRow } from '@/utils/departmentTree'
import { usePresetCounts } from './setup/presetCounts'
import AdminsDrawer from './departments/AdminsDrawer.vue'
import DepartmentFormDialog from './departments/DepartmentFormDialog.vue'
import MoveDepartmentDialog from './departments/MoveDepartmentDialog.vue'

const { t } = useI18n()
const session = useSessionStore()
// Every column of the tree wants 746 px in its card, and 946 with a platform
// administrator's presets, whatever the window (the side bar takes from the
// page): with less, the IDs are left out, the presets go under the name, and
// the rest close up. The card is measured by its toolbar, as wide as the tree.
// Where the card is as narrow as on a phone (its toolbar 542 px or less, the
// width it has in a window of 640 px without the side bar), the columns close
// up further, as they always have, so that a row's courses stay in sight
// beside its menu.
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const narrow = useContainerNarrow(toolbar, () => (session.isAdmin ? 945 : 745))
const phone = useContainerNarrow(toolbar, 542)
const tableRef = useTemplateRef<{ doLayout: () => void }>('tableRef')
useTableRelayout(tableRef, [narrow, phone])
const departments = useDepartmentTree({ immediate: false })
// Read afresh on coming here: someone else may have changed the tree.
onMounted(() => void departments.reload())

const filter = ref('')
const rows = computed<DeptTreeRow[]>(() => {
  const q = filter.value.trim().toLowerCase()
  return treeRows(departments.tree.value, departments.roots.value, q ? (n) => n.name.toLowerCase().includes(q) : undefined)
})
const count = computed(() => departments.administered.value.length)
/** For each department at the head of what the caller administers, where it is in the tree. */
const above = (row: DepartmentNode) =>
  !session.isAdmin && row.parent_id && departments.roots.value.some((r) => r.id === row.id)
    ? departments.pathLabel(row.parent_id)
    : ''

// --- How many presets each has (a platform administrator's page to go to) ----
const { counts: presetCounts, count: countPresets, forget: forgetPresetCounts } = usePresetCounts()
watch(
  () => (session.isAdmin ? departments.nodes.value.map((d) => d.id) : []),
  (ids) => void countPresets(ids),
  { immediate: true },
)
function refresh() {
  forgetPresetCounts()
  void departments.reload()
}

// --- What may be done with each ---------------------------------------------
type Action = DeptAction
const actionsFor = (row: DepartmentNode) => deptActions(row)
const room = (row: DepartmentNode) => roomBeneath(row, departments.maxDepth.value)

const form = ref<{ mode: 'create' | 'rename'; parent: DepartmentNode | null; dept: DepartmentNode | null } | null>(null)
const formOpen = ref(false)
const moving = ref<DepartmentNode | null>(null)
const moveOpen = ref(false)
const staffing = ref<DepartmentNode | null>(null)
const adminsOpen = ref(false)

function onAction(row: DepartmentNode, a: Action) {
  // The row as the tree has it now, not the copy the table was given.
  const node = departments.byId.value.get(row.id) ?? row
  if (a === 'newChild') {
    form.value = { mode: 'create', parent: node, dept: null }
    formOpen.value = true
  } else if (a === 'rename') {
    form.value = { mode: 'rename', parent: null, dept: node }
    formOpen.value = true
  } else if (a === 'move') {
    moving.value = node
    moveOpen.value = true
  } else {
    staffing.value = node
    adminsOpen.value = true
  }
}
function newTop() {
  form.value = { mode: 'create', parent: null, dept: null }
  formOpen.value = true
}
// The drawer's department is kept as the tree changes (its administrator count, say).
watch(
  () => departments.byId.value,
  (byId) => {
    if (staffing.value) staffing.value = byId.get(staffing.value.id) ?? staffing.value
  },
)
</script>

<template>
  <div>
    <PageHeader
      :title="t('adminSetup.departments.title')"
      :subtitle="session.isAdmin ? t('adminSetup.departments.subtitle') : t('deptAdmin.tree.subtitle')"
    >
      <el-button v-if="session.isAdmin" type="primary" @click="newTop">
        <el-icon><Plus /></el-icon>
        <span>{{ t('deptAdmin.tree.newTop') }}</span>
      </el-button>
    </PageHeader>

    <section class="app-card">
      <div ref="toolbar" class="app-toolbar">
        <el-input v-model="filter" :placeholder="t('adminSetup.departments.filter')" clearable class="setup-filter">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <span class="app-toolbar__spacer" />
        <span v-if="count" class="app-muted setup-count">{{ t('adminSetup.departments.count', count) }}</span>
        <RefreshButton :loading="departments.loading.value" @click="refresh" />
      </div>
      <AsyncState
        :loading="departments.loading.value && !departments.loaded.value"
        :error="departments.loaded.value ? null : departments.error.value"
        :empty="!rows.length"
        :empty-text="
          count ? t('adminSetup.departments.noMatch') : session.isAdmin ? t('adminSetup.departments.empty') : t('deptAdmin.tree.empty')
        "
        @retry="departments.reload"
      >
        <el-table ref="tableRef" :data="rows" row-key="id" default-expand-all class="dept-tree" :indent="narrow ? 12 : 20">
          <el-table-column :label="t('adminSetup.departments.name')" :min-width="narrow ? 200 : 280">
            <template #default="{ row }">
              <span class="dept-name">
                <span class="dept-name__text">{{ row.name }}</span>
                <AppTag v-if="row.appointed" variant="outline" :icon="User" class="dept-name__yours">
                  {{ t('deptAdmin.tree.yours') }}
                </AppTag>
              </span>
              <span v-if="above(row)" class="dept-name__above">{{ t('deptAdmin.tree.inPath', { path: above(row) }) }}</span>
              <router-link
                v-if="session.isAdmin && narrow"
                :to="{ name: 'admin-presets', query: { dept: row.id } }"
                class="dept-link dept-name__presets"
              >
                <el-icon><Key /></el-icon>
                <span>
                  {{
                    presetCounts.has(row.id)
                      ? t('adminSetup.departments.presetsN', presetCounts.get(row.id) ?? 0)
                      : t('adminSetup.departments.presets')
                  }}
                </span>
              </router-link>
            </template>
          </el-table-column>
          <el-table-column :label="t('deptAdmin.tree.courses')" :width="narrow ? 80 : 100" align="right">
            <template #default="{ row }">
              <router-link
                v-if="row.course_count != null"
                :to="{ name: 'admin-courses', query: { dept: row.id } }"
                class="dept-link"
                :aria-label="t('deptAdmin.tree.viewCourses', { name: row.name })"
              >
                {{ row.course_count }}
              </router-link>
            </template>
          </el-table-column>
          <el-table-column :label="t('deptAdmin.tree.admins')" :width="phone ? 110 : narrow ? 130 : 150" align="right">
            <template #default="{ row }">
              <el-button
                v-if="row.admin_count != null"
                link
                type="primary"
                class="dept-admins"
                :aria-label="t('deptAdmin.tree.viewAdmins', { name: row.name })"
                @click="onAction(row, 'admins')"
              >
                <el-icon><User /></el-icon>
                <span>{{ row.admin_count }}</span>
              </el-button>
            </template>
          </el-table-column>
          <el-table-column v-if="session.isAdmin && !narrow" :label="t('adminSetup.departments.presets')" min-width="200" align="right">
            <template #default="{ row }">
              <router-link :to="{ name: 'admin-presets', query: { dept: row.id } }" class="dept-link">
                <el-icon><Key /></el-icon>
                <span>
                  {{
                    presetCounts.has(row.id)
                      ? t('adminSetup.departments.viewPresetsN', presetCounts.get(row.id) ?? 0)
                      : t('adminSetup.departments.viewPresets')
                  }}
                </span>
              </router-link>
            </template>
          </el-table-column>
          <el-table-column v-if="!narrow" :label="t('common.labels.id')" min-width="120">
            <template #default="{ row }"><IdText :id="row.id" /></template>
          </el-table-column>
          <el-table-column :label="narrow ? '' : t('common.labels.actions')" :width="phone ? 56 : narrow ? 64 : 96" align="center" fixed="right">
            <template #default="{ row }">
              <el-dropdown v-if="actionsFor(row).length" trigger="click" @command="(a: Action) => onAction(row, a)">
                <el-button text circle :aria-label="t('deptAdmin.tree.more', { name: row.name })" class="dept-more">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="actionsFor(row).includes('newChild')" command="newChild" :disabled="!room(row)">
                      <el-icon><FolderAdd /></el-icon>
                      <span>{{ t('deptAdmin.tree.newChild') }}</span>
                      <span v-if="!room(row)" class="dept-menu__why">
                        {{ t('deptAdmin.tree.depthLimit', { n: departments.maxDepth.value }) }}
                      </span>
                    </el-dropdown-item>
                    <el-dropdown-item v-if="actionsFor(row).includes('rename')" command="rename">
                      <el-icon><Edit /></el-icon>{{ t('deptAdmin.tree.rename') }}
                    </el-dropdown-item>
                    <el-dropdown-item v-if="actionsFor(row).includes('move')" command="move">
                      <el-icon><Rank /></el-icon>{{ t('deptAdmin.tree.move') }}
                    </el-dropdown-item>
                    <el-dropdown-item v-if="actionsFor(row).includes('admins')" command="admins" divided>
                      <el-icon><User /></el-icon>{{ t('deptAdmin.tree.admins') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
      </AsyncState>
    </section>

    <DepartmentFormDialog
      v-if="form"
      v-model="formOpen"
      :mode="form.mode"
      :parent="form.parent"
      :dept="form.dept"
      @done="departments.reload()"
    />
    <MoveDepartmentDialog v-model="moveOpen" :dept="moving" @done="departments.reload()" />
    <AdminsDrawer v-model="adminsOpen" :dept="staffing" @changed="departments.reload()" />
  </div>
</template>

<style scoped>
.setup-filter {
  width: 240px;
  max-width: 100%;
}
.setup-count {
  font-size: 13px;
}
.dept-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  vertical-align: middle;
}
.dept-name__text {
  font-weight: 500;
  word-break: break-word;
}
.dept-name__above {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-word;
}
.dept-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  font-size: 14px;
}
.dept-name__presets {
  display: flex;
  width: fit-content;
  margin-top: 2px;
  font-size: 12px;
}
.dept-link:hover {
  text-decoration: underline;
}
.dept-admins {
  gap: 4px;
}
.dept-menu__why {
  display: block;
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* The tree's expand arrow sits beside the name; the name's own block wraps under it. */
.dept-tree :deep(.el-table__expand-icon) {
  vertical-align: middle;
}
</style>
