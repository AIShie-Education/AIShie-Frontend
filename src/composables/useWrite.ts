// Running a write from a form or a button.
//
// Each logical action keeps one idempotency key for as long as it is being
// retried with the same arguments, so that pressing "save" again after a
// network failure cannot do the thing twice. A new key is taken once the
// action has an answer (executed, proposed, denied, failed) or the arguments
// change: a key reused for different content is a conflict in Core.
import { ref } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { ApiError, newIdempotencyKey, write, type ToolIn, type WriteOutcome, type WriteTool, type ToolOut } from '@/api/http'
import { i18n } from '@/i18n'
import { notifyError, type ReasonScopes } from './useErrors'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})

export interface RunOptions extends ReasonScopes {
  /** Shown when it was executed; defaults to "Done". False shows nothing. */
  success?: string | false
  /** Shown as the title when it failed. */
  errorTitle?: string
  /** False: leave telling the person to the caller. */
  notify?: boolean
}

export function useWrite<N extends WriteTool>(name: N) {
  const pending = ref(false)
  const lastError = ref<ApiError | null>(null)
  let key: string | null = null
  let keyArgs: string | null = null

  /**
   * Runs the tool. Resolves with the outcome when it was executed or
   * proposed, and with null when it was refused or failed (already shown to
   * the person unless notify is false; see lastError).
   */
  async function run(args: ToolIn<N>, opts: RunOptions = {}): Promise<WriteOutcome<ToolOut<N>> | null> {
    const serialized = JSON.stringify(args)
    if (!key || keyArgs !== serialized) {
      key = newIdempotencyKey()
      keyArgs = serialized
    }
    pending.value = true
    lastError.value = null
    try {
      const out = await write(name, args, { idempotencyKey: key })
      key = null
      if (opts.notify !== false) announce(out, opts)
      return out
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError({ status: 0, code: 'internal', message: String(e) })
      lastError.value = err
      // Retrying under the same key is only useful when Core never answered.
      const unanswered = err.isNetwork || err.status >= 500 || err.code === 'rate_limited'
      if (!unanswered) key = null
      if (opts.notify !== false) notifyError(err, opts.errorTitle, opts)
      return null
    } finally {
      pending.value = false
    }
  }

  return { run, pending, lastError }
}

export function announce(out: WriteOutcome<unknown>, opts: RunOptions = {}) {
  if (out.status === 'proposed') {
    ElNotification({
      type: 'info',
      title: t('common.outcome.proposedTitle'),
      message: t('common.outcome.proposed'),
      duration: 6000,
    })
    return
  }
  if (out.replayed) {
    ElMessage({ type: 'info', message: t('common.outcome.replayed') })
    return
  }
  if (opts.success === false) return
  if (out.reviewState === 'pending') {
    ElMessage({ type: 'success', message: t('common.outcome.pendingReview') })
    return
  }
  ElMessage({ type: 'success', message: opts.success ?? t('common.outcome.executed') })
}
