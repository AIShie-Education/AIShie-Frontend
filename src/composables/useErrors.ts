import { h } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'
import { ApiError } from '@/api/http'
import { ceilingRefusalText } from '@/utils/ceilings'
import { shortId } from '@/utils/format'
import { i18n } from '@/i18n'

const t = (key: string, args?: Record<string, unknown>) => i18n.global.t(key, args ?? {})

const WORD = /^[a-z][a-z_]*$/
/** Whether the messages have this key, in the reader's language. */
const has = (key: string): boolean => (i18n.global as unknown as { te: (k: string) => boolean }).te(key)

/**
 * Refusals whose words are shared words of the app's, said wherever the
 * refusal is met: a question to an agent that takes no conversations in the
 * site is told what every page says of such an agent.
 */
const SHARED_REASONS = new Map<string, string>([['agent_answers_elsewhere', 'common.agent.externalNote']])

/**
 * Words of the app's own for a refusal whose reason Core names
 * (details.reason) and which has them (SHARED_REASONS, or
 * deptAdmin.errors.<reason>), with the refusal's details for its
 * placeholders; null for any other. An invitation a department administrator
 * may not make says which rule it failed (details.why). A level above what a
 * seat may hold at all says which permission, how far it may go, and why
 * (ceilingRefusalText).
 */
export function reasonMessage(e: ApiError): string | null {
  const reason = e.details?.reason
  if (typeof reason !== 'string' || !WORD.test(reason)) return null
  const ceiling = ceilingRefusalText(e.details)
  if (ceiling) return ceiling
  const shared = SHARED_REASONS.get(reason)
  if (shared) return t(shared)
  if (reason === 'invite_not_allowed') {
    const why = e.details?.why
    const key = `deptAdmin.errors.inviteWhy.${why}`
    return typeof why === 'string' && WORD.test(why) && has(key) ? t(key) : t('deptAdmin.errors.invite_not_allowed')
  }
  const key = `deptAdmin.errors.${reason}`
  return has(key) ? t(key, { ...e.details }) : null
}

/** A sentence for the person, in their language, with Core's own words where they help. */
export function errorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return (e as Error)?.message ?? String(e)
  if (e.isNetwork) return t('common.errors.network')
  const byReason = reasonMessage(e)
  if (byReason) return byReason
  if (e.actionStatus === 'denied') return t('common.outcome.denied')
  switch (e.code) {
    case 'unauthenticated':
      return t('common.errors.unauthenticated')
    case 'rate_limited':
      return t('common.errors.rateLimited')
    case 'internal':
      return t('common.errors.internal')
    case 'idempotency_conflict':
      return t('common.errors.idempotency')
    case 'forbidden':
      return e.message ? `${t('common.errors.forbiddenAction')} (${e.message})` : t('common.errors.forbiddenAction')
    case 'not_found':
      return e.message || t('common.errors.notFound')
    case 'conflict':
      return `${t('common.errors.conflict')}: ${e.message}`
    case 'failed_precondition':
      return `${t('common.errors.precondition')}: ${e.message}`
    case 'invalid_argument':
      return `${t('common.errors.invalid')}: ${e.message}`
  }
  return e.message || t('common.errors.title')
}

/** Shows an error the way the app shows errors. */
export function notifyError(e: unknown, title?: string) {
  const msg = errorMessage(e)
  if (e instanceof ApiError && e.recorded) {
    ElNotification({
      type: e.actionStatus === 'denied' ? 'warning' : 'error',
      title: title ?? t('common.outcome.failed'),
      message: h('div', [
        h('div', msg),
        h('div', { class: 'app-muted', style: 'margin-top: 4px; font-size: 12px' }, t('common.errors.recordedAs', { id: shortId(e.actionId) })),
      ]),
      duration: 8000,
    })
    return
  }
  ElMessage({ type: 'error', message: title ? `${title}: ${msg}` : msg, duration: 6000, showClose: true })
}
