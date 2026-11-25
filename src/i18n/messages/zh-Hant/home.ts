export default {
  greeting: '你好，{name}',
  subtitle: '你本學期的課程',
  // The next published assignment due in a course, on its card: its title, and when (relative).
  nextDue: '下一個截止：{title}，{when}',
  noInstructor: '未列出講師',
  instructorsUnavailable: '講師資料無法顯示',
  week: {
    title: '本週',
    due: '本週沒有作業截止 | 本週有{n}項作業截止 | 本週有{n}項作業截止',
    waiting: '目前沒有待你決定的事項 | 有{n}項提案待你決定 | 有{n}項提案待你決定',
    waitingAtLeast: '至少有{n}項提案待你決定',
    next: '下一個截止：{title} · {course}，{when}',
    partial: '部分課程資料無法顯示。',
  },
  noCourses: '你尚未加入任何課程。',
  noCoursesAdmin: '你尚未加入任何課程。作為管理員，你可以建立課程並指派講師。',
  goAdmin: '前往管理頁面',
  memberId: '成員 ID',
  expires: '席位到期：{t}',
  scopeStudents: '學生範圍：{scope}',
  scopeAssignments: '作業範圍：{scope}',
  filterPlaceholder: '篩選課程',
  showArchived: '顯示已封存',
  unseated: {
    title: '你管理但尚未加入的課程',
    explain:
      '平台管理員的身分不會讓你進入課程：每個人在課程裡看到什麼，取決於他在該課程的席位。要打開這些課程，請到課程的管理頁指派講師，或指派你自己。',
    manage: '管理課程',
    more: '在平台管理查看全部（{n}）',
  },
}
