// The names of the students a group's work is of, as a page says them: the
// name Core gave with the work (to its own members, and to those who may
// read the member list), else the member list's, "you" for the reader, and
// "someone in the course" where nobody may name them to the reader. A list
// of names is the language's ("Ken Wong and you", 「王健和你」), worked out
// again when the language changes.
import { useI18n } from 'vue-i18n'
import { useCourseStore } from '@/stores/course'
import { useUiStore } from '@/stores/ui'
import { formatList } from '@/utils/format'
import { memberLabel, orderedMembers } from './groupWork'

export interface NamedMember {
  member_id: string
  display_name?: string | null
}

export function useWorkNames() {
  const course = useCourseStore()
  const ui = useUiStore()
  const { t } = useI18n()

  /** One member's name; `start` where it begins a sentence. */
  function nameOf(m: NamedMember | string | null | undefined, opts: { start?: boolean } = {}): string {
    const member = typeof m === 'string' ? { member_id: m } : m
    const someone = opts.start ? t('common.labels.someMember') : t('groupWork.someone')
    if (!member) return someone
    if (member.member_id === course.myMemberId) return opts.start ? t('groupWork.youStart') : t('groupWork.you')
    return memberLabel(member, (id) => course.memberName(id)) ?? someone
  }

  /** Several members' names, the reader first, in the language's list. */
  function namesOf(members: readonly NamedMember[] | null | undefined): string {
    void ui.locale
    return formatList(orderedMembers(members, course.myMemberId).map((m) => nameOf(m)))
  }

  /** A member named by id, from the members a work names where it names them. */
  function nameIn(
    id: string | null | undefined,
    members: readonly NamedMember[] | null | undefined,
    opts: { start?: boolean } = {},
  ): string {
    if (!id) return opts.start ? t('common.labels.someMember') : t('groupWork.someone')
    return nameOf((members ?? []).find((m) => m.member_id === id) ?? id, opts)
  }

  return { nameOf, namesOf, nameIn }
}
