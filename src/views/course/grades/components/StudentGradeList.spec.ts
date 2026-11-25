import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import * as icons from '@element-plus/icons-vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n, setLocale } from '@/i18n'
import type { MatrixColumn, MatrixRow } from './classMatrix'
import StudentGradeList from './StudentGradeList.vue'

const columns: MatrixColumn[] = [
  { key: 'a1', kind: 'assignment', id: 'a1', title: 'Essay', group: null, outOf: '10', isRoot: false, counted: true },
]
const rows: MatrixRow[] = [
  {
    student: { id: 'm-yuki', name: 'Yuki Tanaka', loginId: null, status: 'active' },
    cells: { a1: { state: 'posted', score: '9.5', gradeId: 'g1', value: 9.5 } },
    drafts: 0,
    missing: 0,
    toGrade: 0,
  },
]

describe('StudentGradeList, a phone’s class gradebook', () => {
  it.each([
    ['en', 'Open Yuki Tanaka’s gradebook'],
    ['zh-Hant', '開啟Yuki Tanaka的成績冊'],
    ['zh-Hans', '打开Yuki Tanaka的成绩册'],
  ] as const)('opens a student on a text link to their gradebook, its words alone, with no › after them (%s)', async (locale, words) => {
    setLocale(locale)
    const blank = { render: () => null }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: blank },
        { path: '/courses/:courseId/gradebook/:studentMemberId?', name: 'course-gradebook', component: blank },
        { path: '/courses/:courseId/grades/:gradeId', name: 'course-grade', component: blank },
      ],
    })
    const w = mount(StudentGradeList, {
      props: { courseId: 'c1', columns, rows, nameOf: (s) => s.name ?? s.id, titleOf: (c) => c.title ?? '' },
      global: { plugins: [i18n, ElementPlus, router], components: icons },
    })
    await w.find('.sgl__head').trigger('click')
    const link = w.find('a.sgl__book')
    expect(link.text()).toBe(words)
    expect(link.attributes('href')).toBe('/courses/c1/gradebook/m-yuki')
    expect(link.find('svg').exists()).toBe(false)
    expect(link.find('.el-icon').exists()).toBe(false)
    w.unmount()
    setLocale('en')
  })
})
