import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFrame, saveFrame, SIDEBAR_WIDTH, viewForPath, viewsFor } from './frame'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the views each caller is offered', () => {
  it('gives a student, and an instructor, their courses and their agents', () => {
    // Neither administers anything: their seats' roles do not enter into it.
    expect(viewsFor({ kind: 'human', canAdminister: false })).toEqual(['courses', 'agents'])
  })

  it('gives a department’s administrator, and a platform administrator, administration as well', () => {
    expect(viewsFor({ kind: 'human', canAdminister: true })).toEqual(['courses', 'agents', 'admin'])
  })

  it('gives an agent signed in its courses alone: an agent owns no agents', () => {
    expect(viewsFor({ kind: 'agent', canAdminister: false })).toEqual(['courses'])
  })

  it('offers no agents until it is known that the caller is a person', () => {
    expect(viewsFor({ kind: null, canAdminister: false })).toEqual(['courses'])
    expect(viewsFor({ canAdminister: true })).toEqual(['courses', 'admin'])
  })
})

describe('the view a page belongs to', () => {
  it('is the courses’ for every page of a course', () => {
    expect(viewForPath('/courses/k1')).toBe('courses')
    expect(viewForPath('/courses/k1/materials')).toBe('courses')
    expect(viewForPath('/courses/k1/assignments/a1')).toBe('courses')
  })

  it('is the agents’ for My agents and each agent’s page', () => {
    expect(viewForPath('/account/agents')).toBe('agents')
    expect(viewForPath('/account/agents/ag1')).toBe('agents')
  })

  it('is administration’s for every administration page', () => {
    expect(viewForPath('/admin')).toBe('admin')
    expect(viewForPath('/admin/courses')).toBe('admin')
    expect(viewForPath('/admin/courses/k1')).toBe('admin')
    expect(viewForPath('/admin/presets')).toBe('admin')
  })

  it('is none for home, the account, and anything that only begins like one of them', () => {
    expect(viewForPath('/')).toBeNull()
    expect(viewForPath('/account')).toBeNull()
    expect(viewForPath('/account/agentsx')).toBeNull()
    expect(viewForPath('/administer')).toBeNull()
    expect(viewForPath('/courses')).toBeNull()
  })
})

describe('the side bar’s width', () => {
  it('is fixed, at 260 px', () => {
    expect(SIDEBAR_WIDTH).toBe(260)
  })
})

describe('what this browser remembers of it', () => {
  it('is open on the courses until something is kept', () => {
    expect(loadFrame()).toEqual({ open: true, view: 'courses' })
  })

  it('keeps whether it is open and its view, and no width', () => {
    saveFrame({ open: false, view: 'admin' })
    expect(JSON.parse(localStorage.getItem('aishiteru.sideBar')!)).toEqual({ open: false, view: 'admin' })
    expect(loadFrame()).toEqual({ open: false, view: 'admin' })
  })

  it('leaves out a width kept by an earlier version', () => {
    localStorage.setItem('aishiteru.sideBar', JSON.stringify({ open: true, view: 'agents', width: 333 }))
    expect(loadFrame()).toEqual({ open: true, view: 'agents' })
    saveFrame(loadFrame())
    expect(JSON.parse(localStorage.getItem('aishiteru.sideBar')!)).toEqual({ open: true, view: 'agents' })
  })

  it('takes what it can read, and the rest as new', () => {
    localStorage.setItem('aishiteru.sideBar', '{not json')
    expect(loadFrame()).toEqual({ open: true, view: 'courses' })
    localStorage.setItem('aishiteru.sideBar', JSON.stringify({ open: 'no', view: 'files' }))
    expect(loadFrame()).toEqual({ open: true, view: 'courses' })
    localStorage.setItem('aishiteru.sideBar', JSON.stringify({ open: false }))
    expect(loadFrame()).toEqual({ open: false, view: 'courses' })
    localStorage.setItem('aishiteru.sideBar', 'null')
    expect(loadFrame()).toEqual({ open: true, view: 'courses' })
  })

  it('does without storage where the browser refuses it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(loadFrame()).toEqual({ open: true, view: 'courses' })
    expect(() => saveFrame({ open: false, view: 'agents' })).not.toThrow()
  })
})
