<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'

const model = defineModel<string | string[] | undefined>()
const props = defineProps<{
  multiple?: boolean
  publishedOnly?: boolean
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
}>()
const course = useCourseStore()
const { t } = useI18n()
onMounted(() => void course.ensureAssignments())

const options = computed(() =>
  [...course.assignments.values()].filter((a) => !props.publishedOnly || !!a.published_at),
)
</script>

<template>
  <el-select
    v-model="model"
    :multiple="multiple"
    filterable
    :clearable="clearable"
    :disabled="disabled"
    :loading="course.assignmentsState === 'loading'"
    :placeholder="placeholder ?? t('common.actions.select')"
    class="assignment-select"
  >
    <el-option v-for="a in options" :key="a.id" :value="a.id" :label="a.title" />
  </el-select>
</template>

<style scoped>
.assignment-select {
  min-width: 220px;
}
</style>
