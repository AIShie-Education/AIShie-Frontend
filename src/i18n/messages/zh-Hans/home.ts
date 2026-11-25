export default {
  greeting: '你好，{name}',
  subtitle: '你本学期的课程',
  // The next published assignment due in a course, on its card: its title, and when (relative).
  nextDue: '下一个截止：{title}，{when}',
  noInstructor: '未列出讲师',
  instructorsUnavailable: '讲师资料无法显示',
  week: {
    title: '本周',
    due: '本周没有作业截止 | 本周有{n}项作业截止 | 本周有{n}项作业截止',
    waiting: '目前没有用你的决定处理的事项 | 有{n}项提案等你决定 | 有{n}项提案等你决定',
    waitingAtLeast: '至少有{n}项提案等你决定',
    next: '下一个截止：{title} · {course}，{when}',
    partial: '部分课程资料无法显示。',
  },
  noCourses: '你尚未加入任何课程。',
  noCoursesAdmin: '你尚未加入任何课程。作为管理员，你可以创建课程并指派讲师。',
  goAdmin: '前往管理页面',
  memberId: '成员 ID',
  expires: '席位到期：{t}',
  scopeStudents: '学生范围：{scope}',
  scopeAssignments: '作业范围：{scope}',
  filterPlaceholder: '筛选课程',
  showArchived: '显示已归档',
  unseated: {
    title: '你管理但尚未加入的课程',
    explain:
      '平台管理员的身份不会让你进入课程：每个人在课程里看到什么，取决于他在该课程的席位。要打开这些课程，请到课程的管理页指派讲师，或指派你自己。',
    manage: '管理课程',
    more: '在平台管理查看全部（{n}）',
  },
}
