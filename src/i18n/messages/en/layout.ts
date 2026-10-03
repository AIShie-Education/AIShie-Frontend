export default {
  // The side bar's views, as the activity bar on the window's left edge names them: the caller's courses,
  // their agents (a person's), and administration (common.nav.admin).
  courses: 'Courses',
  agents: 'Agents',
  menu: 'Menu',
  // The caller's account, at the bottom of the activity bar (on a phone, of the side menu): its button, named by
  // whose it is, and its menu, which also holds the language, the theme and signing out (common.nav, common.actions).
  account: {
    button: 'Account: {name}',
    settings: 'Account settings',
  },
  // About AIshie, from the account menu (AboutDialog): which versions are running.
  about: {
    item: 'About AIshie',
    title: 'About',
    web: 'Web app',
    server: 'Server',
    unknown: 'Not known',
  },
  // A newer build deployed since this tab loaded the app (NewVersionNotice): load it, or later.
  newVersion: {
    available: 'A new version is available',
    reload: 'Reload',
    later: 'Later',
  },
  // The side bar on the window's left edge: the activity bar, with a button for each view (on a phone, the
  // menu's tabs), and the view shown beside it.
  side: {
    views: 'Side bar views',
    filter: 'Filter courses',
    showArchived: 'Show archived ({n})',
    noCourses: 'You are not seated in any course yet.',
    noMatch: 'No course matches.',
    // In the phone's menu, the tabs of the course the page is in, listed under it.
    courseTabs: 'Sections of {course}',
    // Courses an administrator administers without a seat in them, which open on their administration page.
    unseated: 'Administered, without a seat',
    unseatedMore: 'All of them ({n}), in Administration',
    noAgents: 'You have no agents yet.',
    failed: 'This could not be loaded.',
  },
  // The tab's name on a page that does not exist (the router's catch-all).
  notFound: 'Page not found',
  // Labels Element Plus gives screen readers on tables (i18n/elementPlus.ts).
  elementPlus: {
    sortLabel: 'Sort by {column}',
    filterLabel: 'Filter by {column}',
    selectAllLabel: 'Select all rows',
    selectRowLabel: 'Select this row',
    expandRowLabel: 'Expand this row',
    collapseRowLabel: 'Collapse this row',
  },
  course: {
    nav: 'Course sections',
    // The top bar's way back up on a course's pages: the course, then the tab (CourseCrumbs).
    crumbs: 'Where you are',
    // The strip's last place, a menu of the tabs that do not fit; with the tab chosen among them, it says which.
    more: 'More',
    moreCurrent: 'More (now: {tab})',
    // The grades' own tabs, under the Grades tab: All grades (a student's own, My grades), the gradebook, the scheme.
    // Not "Grades" again, which the tab strip and the top bar already say.
    gradesNav: 'Grades sections',
    allGrades: 'All grades',
    myGrades: 'My grades',
    overview: 'Overview',
    materials: 'Materials',
    assignments: 'Assignments',
    submissions: 'Submissions',
    grades: 'Grades',
    gradebook: 'Gradebook',
    scheme: 'Grading scheme',
    members: 'Members',
    approvals: 'Approvals',
    agentProposals: 'Your agents’ proposals',
    myActions: 'My actions',
    activity: 'Activity',
    agents: 'Agents',
    adminNoSeat: {
      title: 'You have no seat in this course',
      body: 'Administering the platform does not open a course: what anyone sees inside one comes from their seat in it. Seat this course’s instructor, or yourself, on its administration page.',
      action: 'Go to the course’s administration page',
    },
    paused: 'Your seat in this course is paused: nothing you do here will be accepted until it is resumed.',
  },
}
