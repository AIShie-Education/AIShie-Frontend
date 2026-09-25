import { describe, expect, it } from 'vitest'
import type { Actor } from '@/api/types'
import {
  filtersFromQuery,
  hiddenByKind,
  listArgs,
  matches,
  MAX_SEARCH,
  queryFromFilters,
  searchedId,
  type DirectoryFilters,
} from './directory'

const none: DirectoryFilters = { q: '', kind: '', status: '', role: '' }
const ID = '01a0d79f-13c6-70da-a7cc-f009b1efe423'

function actor(over: Partial<Actor>): Actor {
  return {
    id: ID,
    kind: 'human',
    status: 'active',
    display_name: 'HUANG Xiao',
    email: 'xiao.huang@connect.polyu.hk',
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  }
}

describe('filtersFromQuery', () => {
  it('reads what the address says', () => {
    expect(filtersFromQuery({ q: 'huang', kind: 'agent', status: 'suspended', role: 'none' })).toEqual({
      q: 'huang',
      kind: 'agent',
      status: 'suspended',
      role: 'none',
    })
  })
  it('drops what Core would refuse, so an edited link still opens the list', () => {
    expect(filtersFromQuery({ kind: 'robot', status: 'gone', role: 'teacher' })).toEqual(none)
    expect(filtersFromQuery({ q: ['yuki', 'ken'], kind: null })).toEqual({ ...none, q: 'yuki' })
    expect(filtersFromQuery({})).toEqual(none)
  })
  it('cuts a search at the length Core takes, counting characters', () => {
    expect(filtersFromQuery({ q: 'a'.repeat(300) }).q).toHaveLength(MAX_SEARCH)
    const han = '黃'.repeat(300)
    expect([...filtersFromQuery({ q: han }).q]).toHaveLength(MAX_SEARCH)
    const emoji = '🙂'.repeat(300)
    expect([...filtersFromQuery({ q: emoji }).q]).toHaveLength(MAX_SEARCH)
  })
})

describe('queryFromFilters', () => {
  it('keeps only what is set, the search trimmed', () => {
    expect(queryFromFilters(none)).toEqual({ q: undefined, kind: undefined, status: undefined, role: undefined })
    expect(queryFromFilters({ q: '  huang ', kind: 'human', status: '', role: 'admin' })).toEqual({
      q: 'huang',
      kind: 'human',
      status: undefined,
      role: 'admin',
    })
  })
  it('reads back as it was written', () => {
    const f: DirectoryFilters = { q: 'grader', kind: 'agent', status: 'active', role: 'none' }
    expect(filtersFromQuery(queryFromFilters(f) as Record<string, string>)).toEqual(f)
  })
})

describe('searchedId', () => {
  it('takes an actor id pasted in the box, in the form Core writes it', () => {
    expect(searchedId({ ...none, q: ` ${ID.toUpperCase()} ` })).toBe(ID)
  })
  it('takes anything else for words to search for', () => {
    expect(searchedId({ ...none, q: 'huang' })).toBeNull()
    expect(searchedId({ ...none, q: ID.slice(0, 8) })).toBeNull()
    expect(searchedId(none)).toBeNull()
  })
})

describe('listArgs', () => {
  it('asks for everyone, a page at a time, when nothing is set', () => {
    expect(listArgs(none, undefined, 50)).toEqual({
      q: undefined,
      kind: undefined,
      status: undefined,
      platform_role: undefined,
      after: undefined,
      limit: 50,
    })
  })
  it('passes each filter under the name Core takes it by', () => {
    expect(listArgs({ q: ' Huang ', kind: 'human', status: 'suspended', role: 'none' }, ID, 20)).toEqual({
      q: 'Huang',
      kind: 'human',
      status: 'suspended',
      platform_role: 'none',
      after: ID,
      limit: 20,
    })
  })
  it('sends no search for a box of spaces', () => {
    expect(listArgs({ ...none, q: '   ' }, undefined, 50).q).toBeUndefined()
  })
})

describe('hiddenByKind', () => {
  it('leaves the system actor out unless asked for', () => {
    expect(hiddenByKind({ kind: 'system' }, none)).toBe(true)
    expect(hiddenByKind({ kind: 'human' }, none)).toBe(false)
    expect(hiddenByKind({ kind: 'agent' }, none)).toBe(false)
    expect(hiddenByKind({ kind: 'system' }, { ...none, kind: 'system' })).toBe(false)
    expect(hiddenByKind({ kind: 'human' }, { ...none, kind: 'agent' })).toBe(true)
  })
})

describe('matches', () => {
  it('finds part of the name or the email address, in any case', () => {
    expect(matches(actor({}), { ...none, q: 'huang' })).toBe(true)
    expect(matches(actor({}), { ...none, q: 'POLYU.HK' })).toBe(true)
    expect(matches(actor({}), { ...none, q: '  xiao ' })).toBe(true)
    expect(matches(actor({}), { ...none, q: 'yuki' })).toBe(false)
    expect(matches(actor({ display_name: '黃小明', email: null }), { ...none, q: '小明' })).toBe(true)
  })
  it('takes % and _ as themselves, as Core does', () => {
    expect(matches(actor({ display_name: 'tutor_50%' }), { ...none, q: '_50%' })).toBe(true)
    expect(matches(actor({}), { ...none, q: '%' })).toBe(false)
  })
  it('holds each filter, with none for no platform role', () => {
    const admin = actor({ platform_role: 'admin' })
    expect(matches(admin, { ...none, role: 'admin' })).toBe(true)
    expect(matches(admin, { ...none, role: 'none' })).toBe(false)
    expect(matches(actor({}), { ...none, role: 'none' })).toBe(true)
    expect(matches(actor({ platform_role: null }), { ...none, role: 'none' })).toBe(true)
    expect(matches(actor({}), { ...none, status: 'suspended' })).toBe(false)
    expect(matches(actor({ kind: 'agent', email: null }), { ...none, kind: 'human' })).toBe(false)
    expect(matches(actor({ kind: 'system' }), none)).toBe(false)
  })
})
