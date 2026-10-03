// What a course's layout tells the page header of each of its pages
// (PageHeader): the course's tab strip already names the page, so a title that
// only says the tab again is left to screen readers, and the subtitle alone
// shows; and on the grades' pages, the grades' own tabs, in the title's place.
import type { Component, ComputedRef, InjectionKey } from 'vue'

export interface CoursePage {
  /** Whether a page's title is the name of the tab chosen (or of the grades' tab chosen). */
  isTabName(title: string): boolean
  /** The grades' own tabs, shown in the page header on their pages; null elsewhere. */
  subNav: ComputedRef<Component | null>
}

export const COURSE_PAGE: InjectionKey<CoursePage> = Symbol('course-page')
