<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ hasMore: boolean; loading?: boolean }>()
const emit = defineEmits<{ more: [] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="hasMore" class="load-more">
    <el-button :loading="loading" @click="emit('more')">{{ t('common.pagination.loadMore') }}</el-button>
  </div>
</template>

<style scoped>
.load-more {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}
</style>
