import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/api/http'
import { i18n, setLocale } from '@/i18n'
import { closedReason, emailProblem, joinRefusal, loginIdProblem, nameProblem, passwordProblems } from './join'

beforeEach(() => setLocale('en'))

describe('closedReason', () => {
  it('is null for a link that seats people now', () => {
    expect(closedReason({ joinable: true })).toBeNull()
    expect(closedReason({ joinable: true, reason: 'expired' })).toBeNull()
  })
  it('names each reason Core gives', () => {
    for (const r of ['expired', 'used_up', 'revoked', 'course_archived', 'creator_lost_authority'])
      expect(closedReason({ joinable: false, reason: r })).toBe(r)
  })
  it('says a reason it does not know as a link that no longer works', () => {
    expect(closedReason({ joinable: false })).toBe('invalid')
    expect(closedReason({ joinable: false, reason: 'something_new' })).toBe('invalid')
  })
})

describe('joinRefusal', () => {
  const refused = (reason: string | undefined, status = 422) =>
    new ApiError({
      status,
      code: 'failed_precondition',
      message: 'Core’s own words',
      details: reason ? { reason } : undefined,
    })

  it('says each of Core’s reasons in the app’s words', () => {
    expect(joinRefusal(refused('expired'))).toMatch(/expired/)
    expect(joinRefusal(refused('used_up'))).toMatch(/As many people as this link allows/)
    expect(joinRefusal(refused('revoked'))).toMatch(/revoked/)
    expect(joinRefusal(refused('course_archived'))).toMatch(/archived/)
    expect(joinRefusal(refused('creator_lost_authority'))).toMatch(/can no longer add students/)
    expect(joinRefusal(refused('people_only'))).toMatch(/Only a person/)
    expect(joinRefusal(refused('email_domain_not_allowed'))).toMatch(/certain domains/)
    expect(joinRefusal(refused('email_taken', 409))).toMatch(/already exists. Sign in/)
    expect(joinRefusal(refused('registration_disabled'))).toMatch(/cannot be created through invite links here/)
    expect(joinRefusal(refused('actor_not_active', 403))).toMatch(/suspended/)
  })
  it('names the domains a link is kept to, when Core says which', () => {
    const e = new ApiError({
      status: 422,
      code: 'failed_precondition',
      message: 'x',
      details: { reason: 'email_domain_not_allowed', allowed_email_domains: ['hainanu.edu.cn', 'example.edu'] },
    })
    expect(joinRefusal(e)).toBe(
      'This invite link is only for emails at @hainanu.edu.cn, @example.edu, and this one is not at any of them.',
    )
  })
  it('says the members page’s own refusals in words of their own', () => {
    expect(joinRefusal(refused('not_by_proposal'), 'join.links.errors')).toMatch(
      /never created by a request for approval/,
    )
    expect(joinRefusal(refused('permission_denied', 403), 'join.links.errors')).toMatch(/may not create or revoke/)
    expect(joinRefusal(refused('course_archived', 403), 'join.links.errors')).toMatch(/no invite link can be created/)
    // and the join page does not take them for its own
    expect(joinRefusal(refused('not_by_proposal'))).toBeNull()
  })
  it('in the reader’s language', () => {
    setLocale('zh-Hant')
    expect(joinRefusal(refused('revoked'))).toBe('此邀請連結已被撤銷。請向你的講師索取新的連結。')
    setLocale('zh-Hans')
    expect(joinRefusal(refused('email_taken', 409))).toBe('已有账号使用此邮箱。请以该账号登录后加入课程。')
  })
  it('leaves anything else to the app’s usual words', () => {
    expect(joinRefusal(refused(undefined))).toBeNull()
    expect(joinRefusal(refused('no_such_reason'))).toBeNull()
    expect(joinRefusal(refused('Not A Word'))).toBeNull()
    expect(joinRefusal(new Error('x'))).toBeNull()
  })
})

describe('what the registration form says before Core is asked', () => {
  it('wants a name, and none longer than Core takes', () => {
    expect(nameProblem('  ')).toEqual({ key: 'common.errors.required' })
    expect(nameProblem(' Mei Lin ')).toBeNull()
    expect(nameProblem('林'.repeat(200))).toBeNull()
    expect(nameProblem('林'.repeat(201))).toEqual({ key: 'join.page.tooLongName', args: { n: 200 } })
  })

  it('wants a whole email address, at a domain the link takes', () => {
    expect(emailProblem('', [])).toEqual({ key: 'common.errors.required' })
    expect(emailProblem('mei', [])).toEqual({ key: 'join.page.badEmail' })
    expect(emailProblem('mei@localhost', [])).toEqual({ key: 'join.page.badEmail' })
    expect(emailProblem(' mei@example.edu ', [])).toBeNull()
    expect(emailProblem('Mei@HainanU.edu.cn', ['hainanu.edu.cn'])).toBeNull()
    expect(emailProblem('ken@gmail.com', ['hainanu.edu.cn', 'example.edu'])).toEqual({
      key: 'join.page.emailWrongDomain',
      args: { domains: '@hainanu.edu.cn, @example.edu' },
    })
    // A subdomain is another domain, as Core holds it.
    expect(emailProblem('ken@mail.hainanu.edu.cn', ['hainanu.edu.cn'])?.key).toBe('join.page.emailWrongDomain')
  })

  it('takes no email at all where it is optional, but holds one given to the same rules', () => {
    expect(emailProblem('', [], { optional: true })).toBeNull()
    expect(emailProblem('  ', [], { optional: true })).toBeNull()
    expect(emailProblem('mei', [], { optional: true })).toEqual({ key: 'join.page.badEmail' })
    expect(emailProblem('mei@example.edu', [], { optional: true })).toBeNull()
  })

  it('wants a student number of 1 to 64 letters, digits, dots, hyphens and underscores', () => {
    expect(loginIdProblem(' ')).toEqual({ key: 'common.errors.required' })
    expect(loginIdProblem(' 2024001 ')).toBeNull()
    expect(loginIdProblem('s.lin_2024-A')).toBeNull()
    expect(loginIdProblem('mei@example.edu')).toEqual({ key: 'join.page.loginIdEmail' })
    expect(loginIdProblem('x'.repeat(64))).toBeNull()
    expect(loginIdProblem('x'.repeat(65))).toEqual({ key: 'join.page.loginIdLong', args: { n: 64 } })
    expect(loginIdProblem('2024 001')).toEqual({ key: 'join.page.loginIdChars' })
    expect(loginIdProblem('學號2024')).toEqual({ key: 'join.page.loginIdChars' })
  })

  it('wants a password of 10 bytes or more, typed the same twice', () => {
    expect(passwordProblems('', '')).toEqual({
      password: { key: 'common.errors.required' },
      repeat: { key: 'common.errors.required' },
    })
    expect(passwordProblems('short', 'short').password).toEqual({ key: 'join.page.tooShort' })
    // Five Chinese characters are fifteen bytes.
    expect(passwordProblems('五個中文字', '五個中文字')).toEqual({ password: null, repeat: null })
    expect(passwordProblems('a long enough password', 'a long enough passwore').repeat).toEqual({
      key: 'join.page.mismatch',
    })
    expect(passwordProblems('x'.repeat(1025), 'x'.repeat(1025)).password).toEqual({ key: 'join.page.tooLong' })
  })

  it('says each problem in words the app has, in each language', () => {
    for (const locale of ['en', 'zh-Hant', 'zh-Hans'] as const) {
      setLocale(locale)
      for (const p of [
        nameProblem(''),
        nameProblem('x'.repeat(201)),
        emailProblem('x', []),
        emailProblem('x@y.z', ['a.b']),
        loginIdProblem(''),
        loginIdProblem('a@b'),
        loginIdProblem('x'.repeat(65)),
        loginIdProblem('a b'),
        passwordProblems('x', 'y').password,
        passwordProblems('x', 'y').repeat,
      ]) {
        expect((i18n.global as unknown as { te: (k: string) => boolean }).te(p!.key)).toBe(true)
      }
    }
  })
})

