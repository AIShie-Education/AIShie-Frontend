// "Download as PDF" (下載為 PDF), wherever a text is offered so: a file's
// text version, a version's text note, a text or Markdown file in the viewer,
// a conversation. The text is laid out for paper and the browser's print
// window opened on it (utils/printLayout.ts), where "Save as PDF" makes the
// file; the button says so (PrintButton), and so does a message as the
// window opens, for a touch screen that shows no tooltip.
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { i18n } from '@/i18n'
import { notifyError } from '@/composables/useErrors'
import { useCourseStore } from '@/stores/course'
import { useSessionStore } from '@/stores/session'
import { formatDate } from '@/utils/format'
import { printDocument, type PrintSource } from '@/utils/printLayout'
import { joinParts } from '@/utils/parts'

const t = (key: string, args: Record<string, unknown> = {}) => i18n.global.t(key, args)

/** A print layout, but for its language, which is the reader's. */
export type PrintRequest = Omit<PrintSource, 'lang'>

/** The course a text is of, as its header names it: its code and its title. */
export function courseLine(courseId: string | null | undefined): string | null {
  if (!courseId) return null
  const seat = useSessionStore().membershipFor(courseId)
  const open = useCourseStore().course
  const course = seat ?? (open?.id === courseId ? open : null)
  if (!course) return null
  return course.code && course.code !== course.title ? joinParts([course.code, course.title]) : course.title
}

/** The date a header says: when the text was written, or today. */
export function dateLine(at?: string | null): string {
  return formatDate(at || new Date().toISOString())
}

/** Opens the print window on a layout, saying how to save it; one at a time. */
export function usePrintLayout() {
  const busy = ref(false)
  async function print(req: PrintRequest | (() => PrintRequest | Promise<PrintRequest>)) {
    if (busy.value) return
    // What has the focus (the button pressed), which a busy button loses: it has it again afterwards.
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
    busy.value = true
    try {
      const src = typeof req === 'function' ? await req() : req
      ElMessage({ type: 'info', message: t('preview.print.opening'), duration: 5000, grouping: true })
      await printDocument({ ...src, lang: String(i18n.global.locale.value) })
    } catch (e) {
      notifyError(e, t('preview.print.failed'))
    } finally {
      busy.value = false
      await nextTick()
      if (back?.isConnected && (document.activeElement === document.body || !document.activeElement)) back.focus()
    }
  }
  return { print, busy }
}
