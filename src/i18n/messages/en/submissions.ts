// Submissions: the list of work, one submission, and grading it.
export default {
  title: 'Submissions',
  subtitle: {
    staff:
      'Work handed in and drafts in progress, for the students and assignments you reach. Choose an assignment to see every student on it, including those who have not started, and to record work that was never handed in as missing.',
    student: 'Your work for each assignment, attempt by attempt.',
  },
  filters: {
    assignment: 'All assignments',
    student: 'All students',
  },
  columns: {
    student: 'Student',
    assignment: 'Assignment',
    attempt: 'Attempt',
    state: 'State',
    submittedAt: 'Handed in',
  },
  notHandedIn: 'Not handed in',
  hint: {
    pickAssignment:
      'Choose an assignment to see every student on it, including those who have not started yet, and to mark as missing anyone who has handed in nothing.',
  },
  roster: {
    unavailable:
      'This server cannot list the students who have not started, so only the work that exists is shown here.',
    summary: {
      total: '{n} student | {n} students',
      label: 'Where each student stands',
      partial: 'The counts cover the students loaded so far.',
    },
    emptyState: 'None of these students is at this stage. Choose All to see every one.',
    empty: 'There are no current students on this assignment that you can see.',
    emptyStudent:
      'This student is not among the current students you can see on this assignment. Clear the assignment filter to see all of their work, including from before they left the course.',
    unpublished: 'This assignment is not published: students cannot see it yet, so nobody can be marked as missing it.',
    markMissing: 'Mark missing',
    myActions: 'See my actions',
    confirm: {
      title: 'Mark {name} as missing?',
      body: 'This records that {name} handed in nothing for “{assignment}”, so that it can be graded (with a zero, for example). If they hand in work later, it takes the place of this record, as long as the record has not been graded by then.',
      thisAssignment: 'this assignment',
      notDue: 'It is not due until {due}.',
      needsApproval: 'It will wait for someone to approve it before it takes effect.',
    },
    done: '{name} is marked as missing.',
  },
  empty: {
    filtered: 'No submissions match these filters.',
    none: 'No work has been started or handed in yet.',
    student: 'You have not started any work yet. Open an assignment to begin.',
  },
  links: {
    assignments: 'Go to assignments',
    assignment: 'Open the assignment',
    grades: 'Grades for this assignment',
  },
  detail: {
    title: 'Submission',
    attempt: 'Attempt {n}',
    facts: {
      assignment: 'Assignment',
      student: 'Student',
      state: 'State',
      submittedAt: 'Handed in',
      dueAt: 'Due',
      createdAt: 'Started',
      points: 'Worth',
      instructions: 'Instructions',
    },
    pointsValue: '{n} points',
    noDue: 'No due date',
    instructionsLink: 'As they were when it was handed in',
    noInstructionsVersion: 'None recorded',
    allByStudent: 'All their work',
    allForAssignment: 'All work for this assignment',
    work: 'The work',
    noBody: 'No text was handed in.',
    draftBody: 'No text yet.',
    files: 'Files',
    noFiles: 'No files.',
    attempts: 'Attempts',
    current: 'This one',
    notice: {
      draftOwn:
        'This is a draft: nothing has been handed in yet. Carry on working on it, and hand it in, from the assignment page.',
      draftStaff:
        'This is a draft the student is still working on. It can still change, and it cannot be graded until it is handed in.',
      missingOwn:
        'Nothing was handed in for this, so it is recorded as missing. You can still hand in work from the assignment page, though it may count as late.',
      missingStaff:
        'Nothing was handed in: this is recorded as missing, when the due date passed or by hand, so that it can be graded. If the student hands in work before it is graded, that work takes its place.',
      missingGraded:
        'Nothing was handed in, and that has been graded. Work the student hands in now would be a new attempt, with a grade of its own.',
    },
    continueEditing: 'Continue on the assignment page',
    handInLate: 'Hand in late work',
  },
  grades: {
    title: 'Grades for this work',
    allLink: 'In the grade list',
    empty: 'Not graded yet.',
    emptyStudent: 'No grade has been posted for this work yet.',
    forbidden: 'You cannot read grades in this course.',
    grader: 'Grader',
    entered: 'Entered',
    posted: 'Posted',
    draftHint: 'A draft grade is not visible to the student until it is posted.',
  },
  grade: {
    title: 'Enter a grade',
    notYet: 'This work has not been handed in yet, so it cannot be graded.',
    archived: 'The course is archived: grades can no longer be entered.',
    postedExists: 'This work already has a posted grade. To change it, regrade it from the grade’s page.',
    openPosted: 'Open the posted grade',
    draftExists: 'There is already a draft grade for this work ({score}). Saving a new one replaces it.',
    openDraft: 'Open the draft',
    // Who drafted it: an agent with its avatar and "AI" (MemberName), a person by name.
    draftBy: 'Drafted by {name}',
    // While what the draft filled in is unchanged: those fields carry a line at their left.
    prefilledBy: 'The fields with a line at their left are as {name} drafted them: you have not changed them yet.',
    // After the label of each such field, said to a screen reader alone.
    prefilledMark: '(as an agent drafted it: not changed yet)',
    startFromDraft: 'Start from the current draft',
    forMissing:
      'Nothing was handed in: this grade is for handing in nothing. If late work takes the placeholder’s place before the grade is entered, the grade is refused and the work must be looked at afresh.',
    needsApprovalHint: 'A grade you enter here waits for someone to approve it before it exists.',
    score: 'Score',
    outOf: 'out of {points}',
    scorePlaceholder: 'e.g. 8.5',
    scoreNegative: 'The score cannot be negative',
    scoreAbove: 'This is above the {points} points possible. Tick “Allow extra credit” to give it.',
    allowExtra: 'Allow extra credit (a score above the points possible)',
    breakdown: 'Breakdown by criterion',
    breakdownHint: 'Optional: one line per criterion, as you read the rubric.',
    feedback: 'Feedback',
    feedbackPlaceholder: 'What was done well, and what to work on (Markdown)',
    files: 'Feedback files',
    filesHint: 'Optional: a marked-up script, a recording. They are returned with the grade.',
    submit: 'Save draft grade',
    propose: 'Propose grade',
    replaceConfirm: 'This replaces the current draft grade for this work. Continue?',
    stopConfirm:
      'A grade proposed for this work is waiting for approval. Once this draft is saved, approving that proposal will be refused. Continue?',
    replaceAndStopConfirm:
      'This replaces the current draft grade for this work, and approving the grade proposed for it will then be refused. Continue?',
    pending: {
      other:
        'A grade proposed for this work is waiting for approval. If you save a draft grade now, approving that proposal will be refused: a proposal never replaces a draft entered after it was made.',
      otherPropose:
        'A grade proposed for this work is already waiting for approval. Yours will wait beside it; if both are approved, the one proposed later stands.',
      mine: 'You have already proposed a grade for this work, and it is still waiting for approval. Proposing another does not withdraw it; if both are approved, the one proposed later stands.',
    },
    gradesHidden:
      'Whether this work has been graded already cannot be shown to you. A new grade replaces an earlier draft; but once the work has a posted grade, a new one can never be posted, since a posted grade is changed only by regrading it.',
    draftFiles:
      'The draft you started from has feedback files. They stay with that draft and do not come with this grade: upload again any that should.',
    draftFilesUnknown:
      'Any feedback files on the draft you started from stay with that draft and do not come with this grade: upload again any that should.',
    reset: 'Clear',
    saved: 'Draft grade saved',
    savedBody: 'A draft grade is not visible to the student until it is posted.',
    savedReview: 'It will also be reviewed after the fact.',
    openGrade: 'Open the grade',
    postGrades: 'Post grades for this assignment',
    proposedTitle: 'Waiting for approval',
    proposedBody:
      'Your grade was sent for approval. No grade exists until someone approves it; it then becomes a draft, which still has to be posted.',
    myActions: 'See my actions',
  },
  proposals: {
    title: 'Proposed grades waiting for approval',
    proposer: 'Proposed by',
    proposedAt: 'Proposed',
    hint: 'A proposed grade is not a grade yet. Once approved it becomes a draft, dated when it was proposed, which still has to be posted.',
    fate: {
      newerDraft: 'A draft grade was entered after this was proposed, so approving it will be refused.',
      replacesDraft: 'Approving it replaces the current draft grade.',
      posted:
        'This work already has a posted grade, so the draft this would make could never be posted. A posted grade is changed by regrading it.',
    },
  },
  breakdown: {
    criterion: 'Criterion',
    points: 'Points',
    max: 'Max',
    comment: 'Comment (optional)',
    add: 'Add a criterion',
    remove: 'Remove this line',
    total: 'Total {points} / {max}',
    useTotal: 'Use as score',
    invalid: 'Every line needs a criterion, and points and max as numbers of 0 or more',
  },
  rubric: {
    title: 'Rubric',
    version: 'Version {n}',
    recorded: 'This version is recorded with the grade.',
    none: 'This assignment has no rubric. The grade records that none was shown.',
    unpublished: 'The rubric has not been published, so the grade records none.',
    unpublishedDraft: 'The rubric has not been published, so the grade records none. Shown here is its latest draft.',
    hidden: 'You cannot read rubrics here. The grade is recorded against whichever version of the rubric is published.',
    unavailable:
      'The rubric could not be loaded. The grade is recorded against whichever version of the rubric is published.',
    unknown: 'The assignment could not be loaded, so neither could its rubric.',
    file: 'Rubric file',
    emptyBody: 'This version has no text.',
  },
  lateness: {
    markLate: 'Mark as late',
    markOnTime: 'Mark as on time',
    confirmTitle: 'Correct lateness',
    confirmLate: 'Count this attempt as handed in late?',
    confirmOnTime: 'Count this attempt as handed in on time — for example, because an extension was granted?',
    done: 'Lateness corrected',
  },
}
