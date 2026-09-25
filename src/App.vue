<script setup lang="ts">
import { computed } from 'vue'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import en from 'element-plus/es/locale/lang/en'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const elLocale = computed(() => (ui.locale === 'zh-Hant' ? zhTw : en))
</script>

<template>
  <el-config-provider :locale="elLocale">
    <router-view />
  </el-config-provider>
</template>
