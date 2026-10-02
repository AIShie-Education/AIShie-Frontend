export default {
  // The side bar's views, as the activity bar on the window's left edge names them: the caller's courses,
  // their agents (a person's), and administration (common.nav.admin).
  courses: '課程',
  agents: '代理',
  menu: '選單',
  // The caller's account, at the bottom of the activity bar (on a phone, of the side menu): its button, named by
  // whose it is, and its menu, which also holds the language, the theme and signing out (common.nav, common.actions).
  account: {
    button: '帳戶：{name}',
    settings: '帳戶設定',
  },
  // 帳戶選單中的「關於 AIshie」（AboutDialog）：正在運行的版本。
  about: {
    item: '關於 AIshie',
    title: '關於',
    web: '網頁應用程式',
    server: '伺服器',
    unknown: '未知',
  },
  // A newer build deployed since this tab loaded the app (NewVersionNotice): load it, or later.
  newVersion: {
    available: '已有新版本',
    reload: '重新載入',
    later: '稍後',
  },
  // The side bar on the window's left edge: the activity bar, with a button for each view (on a phone, the
  // menu's tabs), and the view shown beside it.
  side: {
    views: '側邊欄檢視',
    filter: '篩選課程',
    showArchived: '顯示已封存（{n}）',
    noCourses: '你尚未加入任何課程。',
    noMatch: '沒有符合的課程。',
    // In the phone's menu, the tabs of the course the page is in, listed under it.
    courseTabs: '{course}的分頁',
    // Courses an administrator administers without a seat in them, which open on their administration page.
    unseated: '你管理但尚未加入',
    unseatedMore: '在管理頁查看全部（{n}）',
    noAgents: '你還沒有任何代理。',
    failed: '無法載入。',
  },
  // The tab's name on a page that does not exist (the router's catch-all).
  notFound: '找不到頁面',
  // Labels Element Plus gives screen readers on tables (i18n/elementPlus.ts).
  elementPlus: {
    sortLabel: '按「{column}」排序',
    filterLabel: '按「{column}」篩選',
    selectAllLabel: '選取全部',
    selectRowLabel: '選取這一項',
    expandRowLabel: '展開這一項',
    collapseRowLabel: '收合這一項',
  },
  course: {
    nav: '課程分頁',
    // The top bar's way back up on a course's pages: the course, then the tab (CourseCrumbs).
    crumbs: '目前位置',
    // The strip's last place, a menu of the tabs that do not fit; with the tab chosen among them, it says which.
    more: '更多',
    moreCurrent: '更多（目前：{tab}）',
    // The grades' own tabs, under the Grades tab: All grades (a student's own, My grades), the gradebook, the scheme.
    // Not "Grades" again, which the tab strip and the top bar already say.
    gradesNav: '成績分頁',
    allGrades: '全部成績',
    myGrades: '我的成績',
    overview: '概覽',
    materials: '教材',
    assignments: '作業',
    submissions: '提交',
    grades: '成績',
    gradebook: '成績冊',
    scheme: '評分結構',
    members: '成員',
    approvals: '審批',
    agentProposals: '你的代理的提案',
    myActions: '我的操作',
    activity: '動態',
    agents: '代理',
    adminNoSeat: {
      title: '你在這門課程沒有席位',
      body: '平台管理員的身分不會讓你進入課程：每個人在課程裡看到什麼，取決於他在該課程的席位。請到這門課程的管理頁指派講師，或指派你自己。',
      action: '前往課程管理頁',
    },
    paused: '你在此課程的席位已暫停：恢復之前，你在此的任何操作都不會被接受。',
  },
}
