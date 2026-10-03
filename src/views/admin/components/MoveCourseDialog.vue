<script setup lang="ts">
// course.move: a course to another department the caller administers (any,
// for a platform administrator). Its members, their seats and everything in
// it stay as they are; who administers it changes with its department.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDepartmentTree } from '@/composables/useDepartmentTree'
import { useWrite } from '@/composables/useWrite'
import DepartmentPicker from '../departments/DepartmentPicker.vue'
import { courseCodeText } from '@/utils/parts'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ course: { id: string; dept_id: string; code: string; section: string } }>()
const emit = defineEmits<{ moved: [deptId: string] }>()
const { t } = useI18n()
const departments = useDepartmentTree()
const { run, pending } = useWrite('course.move')

const to = ref('')
watch(open, (v) => {
  if (v) to.value = ''
})
const options = computed(() => departments.courseDestinations(props.course.dept_id))
const code = computed(() => courseCodeText(props.course.code, props.course.section))
const where = computed(() => departments.pathLabel(props.course.dept_id))

async function save() {
  if (!to.value || pending.value) return
  const dept = to.value
  const name = departments.byId.value.get(dept)?.name ?? ''
  const out = await run({ course_id: props.course.id, dept_id: dept }, { success: t('deptAdmin.course.moved', { dept: name }) })
  if (!out) return
  open.value = false
  emit('moved', dept)
}
</script>

<template>
  <el-dialog
    v-model="open"
    :title="t('deptAdmin.course.moveTitle', { code })"
    width="560px"
    destroy-on-close
    :close-on-click-modal="!pending"
  >
    <p class="app-form-hint move-course__intro">{{ t('deptAdmin.course.moveIntro') }}</p>
    <div v-if="where" class="move-course__where">
      <span class="move-course__label">{{ t('admin.course.dept') }}</span>
      <span>{{ where }}</span>
    </div>
    <label class="move-course__to" for="move-course-to">{{ t('deptAdmin.course.moveTo') }}</label>
    <DepartmentPicker id="move-course-to" v-model="to" :data="options" />
    <template #footer>
      <el-button @click="open = false">{{ t('common.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="pending" :disabled="!to" @click="save">{{ t('deptAdmin.tree.move') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.move-course__intro {
  margin: 0 0 16px;
  font-size: var(--app-text-sm);
}
.move-course__where {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
  margin-bottom: 16px;
  font-size: var(--app-text-md);
}
.move-course__label {
  font-size: var(--app-text-sm);
  color: var(--el-text-color-secondary);
}
.move-course__to {
  display: block;
  margin-bottom: 6px;
  font-size: var(--app-text-md);
  color: var(--el-text-color-regular);
}
</style>
