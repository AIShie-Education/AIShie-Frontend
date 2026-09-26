<script setup lang="ts">
import { computed } from 'vue'
import { elementLocale } from '@/i18n/elementPlus'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const elLocale = computed(() => elementLocale(ui.locale))
</script>

<template>
  <el-config-provider :locale="elLocale">
    <router-view />
  </el-config-provider>
</template>
