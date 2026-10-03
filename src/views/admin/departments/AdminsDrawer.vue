<script setup lang="ts">
// Who administers a department (department.list_admins): those appointed at
// it, and those of every department above it, who administer it too, each
// with who appointed them and when; past appointments on request.
//
// Whoever administers the department above it appoints and removes its
// administrators (department.add_admin, .remove_admin): so a department's
// own administrators never staff it, and nobody widens their own reach or
// removes whoever is above them. The person is found by their whole email,
// or their whole student or staff number.
// What Core would refuse is said before it is asked: an agent, someone
// suspended, oneself, or someone appointed here already.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { read } from '@/api/http'
import type { ActorLookup, Appointment, DepartmentNode } from '@/api/types'
import { useAsync } from '@/composables/useAsync'
import { useBackCloses } from '@/composables/useBackCloses'
import { useWrite } from '@/composables/useWrite'
import { useSessionStore } from '@/stores/session'
import AppNote from '@/components/AppNote.vue'
import AppTag from '@/components/AppTag.vue'
import AsyncState from '@/components/AsyncState.vue'
import TimeText from '@/components/TimeText.vue'
import { DRAWER_SIZE } from '../setup/presets'
import PersonLookup from '../components/PersonLookup.vue'

const open = defineModel<boolean>({ default: false })
// Back closes it, on a phone (where it is full width, DRAWER_SIZE) as on a desktop: it is laid over
// the page, which it never outlives.
useBackCloses(open, () => (open.value = false))
const props = defineProps<{ dept: DepartmentNode | null }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useI18n()
const session = useSessionStore()

const showRemoved = ref(false)
const deptId = computed(() => props.dept?.id ?? null)
const state = useAsync(
  () =>
    deptId.value
      ? read('department.list_admins', { dept_id: deptId.value, inherited: true, include_removed: showRemoved.value || undefined }).then(
          (o) => o.admins ?? [],
        )
      : Promise.resolve([] as Appointment[]),
  { immediate: false, keepData: true },
)
watch(
  [open, deptId, showRemoved],
  ([isOpen], old) => {
    if (!isOpen) return
    // Another department's (or none yet): not shown while this one's is read.
    if (!old?.[0] || old?.[1] !== deptId.value) state.data.value = undefined
    void state.reload()
  },
  { immediate: true },
)
watch(open, (v) => {
  if (!v) {
    finder.value?.clear()
    person.value = null
  }
})

const all = computed(() => (state.data.value ?? []).filter((a) => a.dept_id === deptId.value || !a.removed_at))
const here = computed(() => all.value.filter((a) => a.dept_id === deptId.value))
/** Those above, by the department of their appointment, nearest first as Core gives them. */
const above = computed(() => {
  const groups: { deptId: string; deptName: string; admins: Appointment[] }[] = []
  for (const a of all.value) {
    if (a.dept_id === deptId.value) continue
    let g = groups.find((x) => x.deptId === a.dept_id)
    if (!g) groups.push((g = { deptId: a.dept_id, deptName: a.dept_name, admins: [] }))
    g.admins.push(a)
  }
  return groups
})

/** The caller may appoint and remove here: they administer the department above it. */
const staffs = computed(() => !!props.dept?.manages)

// --- Appointing ---------------------------------------------------------------
const finder = ref<InstanceType<typeof PersonLookup>>()
const person = ref<ActorLookup | null>(null)
const addW = useWrite('department.add_admin')
const blocker = computed(() => {
  const p = person.value
  if (!p) return null
  if (p.actor_id === session.me?.id) return t('deptAdmin.admins.blocked.self')
  if (p.kind !== 'human') return t('deptAdmin.admins.blocked.agent')
  if (p.status !== 'active') return t('deptAdmin.admins.blocked.suspended')
  if (here.value.some((a) => a.actor_id === p.actor_id && !a.removed_at)) return t('deptAdmin.admins.blocked.already')
  return null
})

async function appoint() {
  const p = person.value
  if (!p || !props.dept || blocker.value) return
  const out = await addW.run({ dept_id: props.dept.id, actor_id: p.actor_id }, { success: t('deptAdmin.admins.added', { name: p.display_name }) })
  if (!out || out.status !== 'executed') return
  if (out.result.covered_above) {
    ElMessage({ type: 'info', message: t('deptAdmin.admins.coveredAbove', { name: p.display_name }), duration: 6000, showClose: true })
  }
  finder.value?.clear()
  person.value = null
  await state.reload()
  emit('changed')
}

// --- Ending one -----------------------------------------------------------------
const removeW = useWrite('department.remove_admin')
const removing = ref<string | null>(null)
async function remove(a: Appointment) {
  if (!props.dept) return
  const ok = await ElMessageBox.confirm(
    t('deptAdmin.admins.removeConfirm', { name: a.display_name, dept: props.dept.name }),
    t('deptAdmin.admins.removeTitle', { name: a.display_name }),
    {
      type: 'warning',
      confirmButtonText: t('deptAdmin.admins.remove'),
      cancelButtonText: t('common.actions.cancel'),
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!ok) return
  removing.value = a.id
  const out = await removeW.run(
    { dept_id: props.dept.id, actor_id: a.actor_id },
    { success: t('deptAdmin.admins.removed', { name: a.display_name }) },
  ).finally(() => (removing.value = null))
  if (!out) return
  await state.reload()
  emit('changed')
}
</script>

<template>
  <!-- append-to-body: out of AppLayout's subtree, whose nav-drawer style would reach it too. -->
  <el-drawer
    v-model="open"
    append-to-body
    :size="DRAWER_SIZE"
    :title="dept ? t('deptAdmin.admins.title', { name: dept.name }) : ''"
    class="admins-drawer"
  >
    <template v-if="dept">
      <p class="app-muted admins-drawer__intro">{{ t('deptAdmin.admins.intro') }}</p>

      <div class="admins-drawer__switch">
        <el-switch v-model="showRemoved" :active-text="t('deptAdmin.admins.showRemoved')" />
      </div>

      <AsyncState
        :loading="state.loading.value && !state.data.value"
        :error="state.data.value ? null : state.error.value"
        @retry="state.reload"
      >
        <section class="admins-drawer__group" aria-labelledby="admins-here">
          <h3 id="admins-here" class="admins-drawer__heading">{{ t('deptAdmin.admins.here') }}</h3>
          <p v-if="!here.length" class="app-muted admins-drawer__none">{{ t('deptAdmin.admins.none') }}</p>
          <ul v-else class="admins-drawer__list">
            <li v-for="a in here" :key="a.id" class="admins-drawer__item" :class="{ 'is-ended': !!a.removed_at }">
              <div class="admins-drawer__who">
                <span class="admins-drawer__name"
                  >{{ a.display_name
                  }}<span v-if="a.actor_id === session.me?.id" class="app-muted app-you">{{
                    t('common.labels.youTag')
                  }}</span></span
                >
                <AppTag v-if="a.removed_at">{{ t('deptAdmin.admins.ended') }}</AppTag>
              </div>
              <div class="admins-drawer__meta">
                <i18n-t keypath="deptAdmin.admins.appointedBy" tag="div" scope="global">
                  <template #name>{{ a.appointed_by_name }}</template>
                  <template #date><TimeText :value="a.appointed_at" /></template>
                </i18n-t>
                <i18n-t v-if="a.removed_at" keypath="deptAdmin.admins.removedBy" tag="div" scope="global">
                  <template #name>{{ a.removed_by_name ?? '' }}</template>
                  <template #date><TimeText :value="a.removed_at" /></template>
                </i18n-t>
              </div>
              <el-button
                v-if="staffs && !a.removed_at"
                size="small"
                type="danger"
                plain
                :loading="removing === a.id"
                class="admins-drawer__remove"
                @click="remove(a)"
              >
                {{ t('deptAdmin.admins.remove') }}
              </el-button>
            </li>
          </ul>
        </section>

        <section v-for="g in above" :key="g.deptId" class="admins-drawer__group">
          <h3 class="admins-drawer__heading">{{ t('deptAdmin.admins.above', { dept: g.deptName }) }}</h3>
          <ul class="admins-drawer__list">
            <li v-for="a in g.admins" :key="a.id" class="admins-drawer__item">
              <div class="admins-drawer__who">
                <span class="admins-drawer__name"
                  >{{ a.display_name
                  }}<span v-if="a.actor_id === session.me?.id" class="app-muted app-you">{{
                    t('common.labels.youTag')
                  }}</span></span
                >
              </div>
              <i18n-t keypath="deptAdmin.admins.appointedBy" tag="div" scope="global" class="admins-drawer__meta">
                <template #name>{{ a.appointed_by_name }}</template>
                <template #date><TimeText :value="a.appointed_at" /></template>
              </i18n-t>
            </li>
          </ul>
        </section>
      </AsyncState>

      <section class="admins-drawer__add" aria-labelledby="admins-add">
        <h3 id="admins-add" class="admins-drawer__heading">{{ t('deptAdmin.admins.add') }}</h3>
        <AppNote v-if="!staffs">
          {{ dept.parent_id ? t('deptAdmin.admins.cannotHere') : t('deptAdmin.admins.cannotTop') }}
        </AppNote>
        <template v-else>
          <p class="app-form-hint admins-drawer__add-hint">{{ t('deptAdmin.admins.addHint') }}</p>
          <PersonLookup ref="finder" @found="(p) => (person = p)" @missing="person = null" @cleared="person = null">
            <template #default="{ person: p }">
              <el-alert v-if="blocker" type="warning" :closable="false" show-icon :title="blocker" />
              <div class="admins-drawer__actions">
                <el-button type="primary" :loading="addW.pending.value" :disabled="!!blocker" @click="appoint">
                  <el-icon><UserFilled /></el-icon>
                  <span>{{ t('deptAdmin.admins.appoint', { name: p.display_name }) }}</span>
                </el-button>
              </div>
            </template>
          </PersonLookup>
        </template>
      </section>
    </template>
  </el-drawer>
</template>

<style scoped>
.admins-drawer__intro {
  margin: 0 0 12px;
  font-size: var(--app-text-sm);
  line-height: var(--app-lh-text);
}
.admins-drawer__switch {
  margin-bottom: 12px;
}
.admins-drawer__group + .admins-drawer__group {
  margin-top: 20px;
}
.admins-drawer__heading {
  margin: 0 0 8px;
  font-size: var(--app-text-md);
  font-weight: var(--app-heading-weight);
}
.admins-drawer__none {
  margin: 0;
  font-size: var(--app-text-sm);
}
.admins-drawer__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.admins-drawer__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--app-radius-item);
  background: var(--el-fill-color-blank);
}
.admins-drawer__item.is-ended {
  background: var(--el-fill-color-lighter);
}
.admins-drawer__who {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.admins-drawer__name {
  font-weight: var(--app-weight-strong);
  word-break: break-word;
}
.admins-drawer__name .app-you {
  font-weight: 400;
}
.admins-drawer__meta {
  grid-column: 1;
  font-size: var(--app-text-xs);
  color: var(--el-text-color-secondary);
}
.admins-drawer__remove {
  grid-column: 2;
  grid-row: 1 / span 2;
}
.admins-drawer__add {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.admins-drawer__add-hint {
  margin: 0 0 12px;
}
.admins-drawer__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
