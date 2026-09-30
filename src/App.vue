<script setup lang="ts">
import { computed } from 'vue'
import { installDropGuard } from '@/composables/useFileDrop'
import { elementLocale } from '@/i18n/elementPlus'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const elLocale = computed(() => elementLocale(ui.locale))
// A file dropped where nothing takes it is not opened in the app's place.
installDropGuard()
</script>

<template>
  <el-config-provider :locale="elLocale">
    <router-view />
  </el-config-provider>
</template>
