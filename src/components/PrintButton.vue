<script setup lang="ts">
// "Download as PDF" (下載為 PDF): opens the browser's print window on the
// text laid out for paper (usePrintLayout), where "Save as PDF" makes the
// file. It says so: in its tooltip, to a screen reader, and as the window
// opens.
import { useI18n } from 'vue-i18n'
import { usePrintLayout, type PrintRequest } from '@/composables/usePrintLayout'

const props = withDefaults(
  defineProps<{
    /** What is laid out, made when the button is pressed. */
    source: () => PrintRequest | Promise<PrintRequest>
    size?: 'small' | 'default'
    /** A link-like button, as beside a text; otherwise a plain one. */
    link?: boolean
    text?: boolean
    disabled?: boolean
  }>(),
  { size: 'small', link: false, text: false, disabled: false },
)
const { t } = useI18n()
const { print, busy } = usePrintLayout()
const hintId = `print-hint-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <span class="print-button">
    <!-- The tooltip's trigger is the span: on the button, it would take the button's description away. -->
    <el-tooltip :content="t('preview.print.hint')" placement="top" :trigger-keys="[]">
      <span class="print-button__trigger">
        <el-button
          :size="size"
          :link="link"
          :text="text"
          :type="link ? 'primary' : undefined"
          :loading="busy"
          :disabled="disabled"
          :aria-describedby="hintId"
          class="print-button__button"
          @click="print(props.source)"
        >
          <el-icon v-if="!busy"><Printer /></el-icon>
          <span>{{ t('preview.print.button') }}</span>
        </el-button>
      </span>
    </el-tooltip>
    <span :id="hintId" class="print-button__hint">{{ t('preview.print.hint') }}</span>
  </span>
</template>

<style scoped>
.print-button,
.print-button__trigger {
  display: inline-flex;
  align-items: center;
}
/* Said to a screen reader with the button; on screen, its tooltip says it. */
.print-button__hint {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
