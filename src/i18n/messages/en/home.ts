export default {
  greeting: 'Hello, {name}',
  subtitle: 'Your courses this term',
  // The next published assignment due in a course, on its card: its title, and when (relative).
  nextDue: 'Next due: {title}, {when}',
  noInstructor: 'No instructor listed',
  instructorsUnavailable: 'Instructor details unavailable',
  week: {
    title: 'This week',
    due: 'Nothing due this week | One assignment due this week | {n} assignments due this week',
    waiting: 'Nothing awaiting a decision | One proposal awaiting a decision | {n} proposals awaiting decisions',
    waitingAtLeast: 'At least one proposal awaits a decision | At least {n} proposals await decisions',
    next: 'Next: {title} · {course}, {when}',
    partial: 'Some course details are unavailable.',
  },
  noCourses: 'You are not seated in any course yet.',
  noCoursesAdmin: 'You are not seated in any course. As an administrator you can create courses and seat instructors.',
  goAdmin: 'Go to administration',
  memberId: 'Member ID',
  expires: 'Seat ends {t}',
  scopeStudents: 'Students: {scope}',
  scopeAssignments: 'Assignments: {scope}',
  filterPlaceholder: 'Filter courses',
  showArchived: 'Show archived',
  unseated: {
    title: 'Courses you administer without a seat',
    explain:
      'Administering the platform does not open a course: what anyone sees inside one comes from their seat in it. To open one of these, seat its instructor, or yourself, on its administration page.',
    manage: 'Manage course',
    more: 'All of them ({n}), in Administration',
  },
}
