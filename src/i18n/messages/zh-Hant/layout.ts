export default {
  courses: '課程',
  menu: '選單',
  // The rail along the window's right edge, with a button for each side panel (the chat's).
  panels: '側邊面板',
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
