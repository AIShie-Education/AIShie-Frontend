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
const SHARED_REASONS = new Map<string, string>([
  ['agent_answers_elsewhere', 'common.agent.externalNote'],
  // A person asked, or answering, in a conversation: conversations are with
  // agents. (Refusing a person conversation_answer names the permission and
  // the ceiling too, and is said as a ceiling is: ceilingRefusalText.)
  ['conversations_are_with_agents', 'common.errors.conversationsAreWithAgents'],
  // Marking read a conversation one only oversees.
  ['not_a_participant', 'common.errors.notAParticipant'],
  // An agent's owner decides or reviews what it did only where they could
  // have done it themselves without anyone's confirmation.
  ['owner_not_autonomous', 'common.errors.ownerNotAutonomous'],
])

/** Where a page keeps words of its own for the refusals of what it does, by reason. */
export interface ReasonScopes {
  /**
   * Message trees keyed by Core's reasons (details.reason), asked first, in
   * order: 'grades.refusal' finds grades.refusal.no_total. A reason two tools
   * give for different things (not_a_person) is said in the words of the page
   * that met it.
   */
  reasons?: string | readonly string[]
}

/** The words the scopes given have for the refusal's reason, and nothing else; null when none has them. */
export function scopedReasonMessage(e: unknown, opts: ReasonScopes): string | null {
  if (!(e instanceof ApiError)) return null
  const reason = e.details?.reason
  if (typeof reason !== 'string' || !WORD.test(reason)) return null
  const scopes = typeof opts.reasons === 'string' ? [opts.reasons] : (opts.reasons ?? [])
  for (const scope of scopes) {
    const key = `${scope}.${reason}`
    if (has(key)) return t(key, { ...e.details })
  }
  return null
}

/**
 * Words of the app's own for a refusal whose reason Core names
 * (details.reason) and which has them (the scopes given, SHARED_REASONS, or
 * deptAdmin.errors.<reason>), with the refusal's details for its
 * placeholders; null for any other. An invitation a department administrator
 * may not make says which rule it failed (details.why). A level above what a
 * seat may hold at all says which permission, how far it may go, and why
 * (ceilingRefusalText).
 */
export function reasonMessage(e: ApiError, opts: ReasonScopes = {}): string | null {
  const reason = e.details?.reason
  if (typeof reason !== 'string' || !WORD.test(reason)) return null
  const scoped = scopedReasonMessage(e, opts)
  if (scoped) return scoped
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
export function errorMessage(e: unknown, opts: ReasonScopes = {}): string {
  if (!(e instanceof ApiError)) return (e as Error)?.message ?? String(e)
  if (e.isNetwork) return t('common.errors.network')
  const byReason = reasonMessage(e, opts)
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
export function notifyError(e: unknown, title?: string, opts: ReasonScopes = {}) {
  const msg = errorMessage(e, opts)
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
