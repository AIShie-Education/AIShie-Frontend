export default {
  // The side bar's views, as the activity bar on the window's left edge names them: the caller's courses,
  // their agents (a person's), and administration (common.nav.admin).
  courses: '课程',
  agents: '智能体',
  menu: '菜单',
  // The caller's account, at the bottom of the activity bar (on a phone, of the side menu): its button, named by
  // whose it is, and its menu, which also holds the language, the theme and signing out (common.nav, common.actions).
  account: {
    button: '账号：{name}',
    settings: '账号设置',
  },
  // 账号菜单中的“关于 AIshie”（AboutDialog）：正在运行的版本。
  about: {
    item: '关于 AIshie',
    title: '关于',
    web: '网页应用',
    server: '服务器',
    unknown: '未知',
  },
  // A newer build deployed since this tab loaded the app (NewVersionNotice): load it, or later.
  newVersion: {
    available: '已有新版本',
    reload: '重新加载',
    later: '稍后',
  },
  // The side bar on the window's left edge: the activity bar, with a button for each view (on a phone, the
  // menu's tabs), and the view shown beside it.
  side: {
    views: '侧边栏视图',
    filter: '筛选课程',
    showArchived: '显示已归档（{n}）',
    noCourses: '你尚未加入任何课程。',
    noMatch: '没有符合的课程。',
    // In the phone's menu, the tabs of the course the page is in, listed under it.
    courseTabs: '{course}的栏目',
    // Courses an administrator administers without a seat in them, which open on their administration page.
    unseated: '你管理但尚未加入',
    unseatedMore: '在管理页查看全部（{n}）',
    noAgents: '你还没有任何智能体。',
    failed: '无法加载。',
  },
  // The tab's name on a page that does not exist (the router's catch-all).
  notFound: '找不到页面',
  // Labels Element Plus gives screen readers on tables (i18n/elementPlus.ts).
  elementPlus: {
    sortLabel: '按“{column}”排序',
    filterLabel: '按“{column}”筛选',
    selectAllLabel: '选择所有行',
    selectRowLabel: '选择此行',
    expandRowLabel: '展开此行',
    collapseRowLabel: '收起此行',
  },
  course: {
    nav: '课程栏目',
    // The top bar's way back up on a course's pages: the course, then the tab (CourseCrumbs).
    crumbs: '当前位置',
    // The strip's last place, a menu of the tabs that do not fit; with the tab chosen among them, it says which.
    more: '更多',
    moreCurrent: '更多（当前：{tab}）',
    // The grades' own tabs, under the Grades tab: All grades (a student's own, My grades), the gradebook, the scheme.
    // Not "Grades" again, which the tab strip and the top bar already say.
    gradesNav: '成绩栏目',
    allGrades: '全部成绩',
    myGrades: '我的成绩',
    overview: '概览',
    materials: '教材',
    assignments: '作业',
    submissions: '提交',
    grades: '成绩',
    gradebook: '成绩册',
    scheme: '评分结构',
    members: '成员',
    approvals: '审批',
    agentProposals: '你的智能体的提议',
    myActions: '我的操作',
    activity: '动态',
    agents: '智能体',
    adminNoSeat: {
      title: '你在这门课程没有席位',
      body: '平台管理员的身份不会让你进入课程：每个人在课程里看到什么，取决于他在该课程的席位。请到这门课程的管理页指派讲师，或指派你自己。',
      action: '前往课程管理页',
    },
    paused: '你在此课程的席位已暂停：恢复之前，你在此的任何操作都不会被接受。',
  },
}
