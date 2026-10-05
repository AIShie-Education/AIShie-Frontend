// Grading a group's work: one group grade for every member of the work, a
// member's score set apart from it with a reason, whose work it is, and the
// marks the grade lists and gradebooks give a grade from a group's.
export default {
  // A score and what it is out of.
  score: '{score} / {points}',
  // How a member's score was given from their group's.
  adjustment: {
    none: 'The group’s score',
    replace: 'A score of their own: {points}',
    plus: 'The group’s score plus {points}',
    minus: 'The group’s score minus {points}',
    peerPlus: 'Peer evaluation added {points}',
    peerMinus: 'Peer evaluation took off {points}',
    peerEven: 'Peer evaluation counted, with no change',
    peerDetail: 'Received {factor} times an even share, counted at {weight}',
    other: 'Set apart from the group’s score: {points}',
    reason: 'Reason',
    // {name}: who set it, for those who grade.
    by: 'Set by {name}',
  },
  // Marks beside a grade in a list.
  mark: {
    group: 'Group work',
    adjusted: 'Adjusted',
    peer: 'Peer evaluation',
  },
  // The grading form on a group's work.
  panel: {
    score: 'Group score',
    intro: 'One grade for the group: every member of the work is given its score, feedback, breakdown and files.',
    draftExists:
      'This work has a draft group grade ({score}), and each member a draft from it. Saving a new one replaces them all.',
    postedExists:
      'The group’s grade is posted. To change it, regrade the group from any member’s grade; to change one member’s, adjust theirs.',
    openPosted: 'Open a member’s posted grade',
    replaceConfirm: 'This replaces the group’s draft grade, and every member’s draft from it. Continue?',
    savedBody:
      'A draft grade for the {n} member of the work. Nobody sees it until it is posted. | A draft grade for each of the {n} members of the work. Nobody sees them until they are posted.',
    filesHint:
      'Optional: marked-up files, a recording, and so on. They are the group’s: every member of the work gets them with their grade.',
    // A seat that does not reach every member of the work: Core grades it only for one that does.
    unreached:
      'Some members of this work are outside the students your seat reaches. A group’s grade is given to every member of its work, so it is entered by someone whose seat reaches them all.',
  },
  // Each member's line.
  editor: {
    title: 'Each member’s score',
    hint: 'Each member is given the group’s score unless you set theirs apart here, with a reason: they read it with their grade, and no other member sees it.',
    // Where the work's grades cannot be read: each line is kept as the member's grade has it, unseen.
    hintUnseen:
      'The grades already given for this work cannot be shown to you, so each member’s line keeps what their grade has now: a score set apart from the group’s stays, with its reason. Set a line only to change it.',
    kind: {
      keep: 'Kept as it is',
      none: 'The group’s score',
      replace: 'A score of their own',
      delta: 'Plus or minus',
    },
    kindLabel: 'How {name}’s score is given',
    thisMember: 'this member',
    points: {
      replace: 'Their score',
      delta: 'Points added (below zero to take away)',
    },
    pointsPlaceholder: {
      replace: 'e.g. 90',
      delta: 'e.g. -10',
    },
    reason: 'Reason (the member reads it)',
    reasonPlaceholder: 'e.g. Missed two of the group’s meetings',
    result: 'Comes to {score}',
    resultOutOf: 'Comes to {score} / {points}',
    resultPending: 'Comes to the group’s score',
    resultKept: 'As their grade has it now',
    peer: 'Peer evaluation moves it again as the grade is saved, where its form counts.',
    noMembers: 'This work names nobody whose work it is.',
    problem: {
      points: 'Enter a number.',
      negative: 'A score cannot be below zero.',
      reason: 'Say why: the member reads it.',
      reasonLong: 'At most {max} characters.',
      belowZero: 'This comes to below zero.',
      abovePoints: 'This comes to more than {points}: allow extra points to give it.',
      abovePointsMaybe:
        'This comes to more than {points}: it is saved only where the group’s grade allows extra points.',
    },
  },
  // The grades for a group's work, on its page.
  grades: {
    groupScore: '{group}’s score',
    yours: 'Your grade',
    open: 'Open {name}’s grade',
    empty: 'Not graded yet.',
    noGrade: 'No grade from this work yet',
    // A member the caller's seat does not reach, whose grade Core does not show it.
    unreached: 'Outside the students your seat reaches: their grade is not shown to you',
    // One it may not reach, where that is not known.
    notShown: 'No grade of theirs is shown to you',
    noGradeDraft:
      'A member with no grade was added to the work after it was graded: saving the group’s grade again gives them a draft.',
    noGradePosted:
      'A member with no grade was added to the work after it was graded: regrading the group gives them a grade from it.',
    adjust: 'Adjust',
    showEarlier: 'Show the earlier grade | Show the {n} earlier grades',
    hideEarlier: 'Hide the earlier grades',
  },
  // One member's adjustment.
  adjust: {
    title: 'Adjust {name}’s grade',
    groupScore: 'The group’s score',
    now: 'Their score now',
    how: 'How their score is given',
    introDraft: 'A new draft takes this one’s place. The member sees nothing until it is posted.',
    introPosted:
      'A new posted grade takes this one’s place at once, the old one kept in its history, and the member’s totals are worked out again. They see the new score, and the reason.',
    result: 'Their score will be {score} / {points}',
    submit: 'Save',
    propose: 'Propose',
    approvalNote: 'Your adjustment waits for someone to approve it; until then the member’s grade is as it was.',
    done: 'Grade adjusted',
    unchanged: 'Nothing changed: the grade already says this.',
    proposed: 'The adjustment is waiting for approval.',
  },
  // A member's grade from their group's, on its own page.
  card: {
    title: 'Group work',
    group: 'Group',
    groupScore: 'The group’s score',
    memberScore: 'This member’s score',
    yourScore: 'Your score',
    how: 'How it was given',
    shared: 'The feedback, breakdown and files below are the group’s: every member of the work reads them.',
    sharedMine:
      'The feedback and files below are your group’s: every member of the work reads them. Your score, and the reason it differs from the group’s, are yours alone.',
    adjust: 'Adjust',
  },
  // Regrading a member's grade from a group's: the group's as a whole.
  regrade: {
    button: 'Regrade the group',
    title: 'Regrade the group',
    current: 'The group’s grade for {what} now:',
    intro:
      'A new group grade: every member whose grade came from the group’s gets a new posted grade at once, the old ones kept in their history, and their totals are worked out again. Each member’s line is as their grade is now: change it here, or leave it.',
    score: 'New group score',
    membersHint: 'Members added to the work since it was graded are given a grade too.',
    partlyPosted:
      'Some members’ grades from the group’s grade are still drafts. Post them first, then regrade the group.',
    unreached:
      'Some members of this work are outside the students your seat reaches. The group is regraded by someone whose seat reaches them all.',
  },
  // Whose work a group's submission is.
  members: {
    title: 'Whose work this is',
    group: 'Group',
    groupWork: 'Group work',
    handedIn: 'Handed it in',
    hintDraft: 'A draft is its group’s work: whoever is in the group now reads and writes it.',
    hintStaff:
      'The group’s members when it was handed in, or recorded missing: each gets their grade from it. Whoever has joined or left the group since is marked; a change of group never changes whose work this is.',
    hintMember: 'Your group’s members when it was handed in, or recorded missing.',
    standing: {
      left: 'Has left the group since',
      outside: 'Not in the group: part of this work by a correction',
      joinedSince: 'Joined the group after this was handed in: not part of it',
      notPart: 'In the group, but not part of this work',
      unreached: 'Outside the students your seat reaches',
    },
    standingAt: {
      left: 'Left the group {time}',
      joinedSince: 'Joined the group {time}, after this was handed in: not part of it',
      notPart: 'In the group since {time}, but not part of this work',
    },
    groupUnknown: 'Who is in the group now could not be read, so nobody is marked.',
    unreachedHint:
      'Some members of this work are outside the students your seat reaches, so whether they are in the group now is not shown to you. Whose work this is, and whether it was late, are corrected by someone whose seat reaches every member.',
    correct: 'Correct members',
  },
  // submission.set_members
  correct: {
    title: 'Correct whose work this is',
    intro:
      'Add a student the group handed this in without, or take off someone who was not part of it. Who handed in work with whom is for those who grade to correct; each change is recorded.',
    current: 'Members',
    remove: 'Take {name} off',
    graded: 'Has a grade on this work, which stays theirs',
    add: 'Add',
    addPlaceholder: 'Choose students',
    suggest: 'In the group now, not part of this work:',
    addHint:
      'A student added has no grade from this work until the group’s grade is saved again, or the group is regraded. One who is part of another group’s work for this assignment cannot be added.',
    willAdd: 'Adds {names}',
    willRemove: 'Takes {names} off',
    empty: 'At least one member has to stay.',
    nothing: 'Nothing is changed yet.',
    submit: 'Save',
    propose: 'Propose',
    approvalNote: 'The correction waits for someone to approve it.',
    done: 'Members corrected',
  },
  // What those who grade are told of a group's draft, or of its missing work.
  notice: {
    draftStaff:
      'This is a draft the group is still working on: any of its members now can change it. It cannot be graded until it is handed in.',
    missingStaff:
      'Nothing was handed in: this is recorded as missing for the group’s members then, when the due date passed or by hand, so that it can be graded. If the group hands in work before it is graded, that work takes its place.',
    missingGraded:
      'Nothing was handed in, and that has been graded. Work the group hands in now would be a new attempt, with grades of its own.',
  },
  // Correcting lateness, for a group's work.
  lateness: {
    confirmLate: 'Count this hand-in as late, for every member of the group’s work?',
    confirmOnTime: 'Count this hand-in as on time (an extension granted, say), for every member of the group’s work?',
  },
  // The class's gradebook.
  classbook: {
    groupOf: '{name}’s grade',
    sentence: 'From {group}.',
    adjusted: 'From {group}, adjusted for this member.',
    peer: 'From {group}, moved by peer evaluation.',
    legend:
      'Two figures before a score mark a grade from a group’s; ± after it, a member’s score a grader set apart from the group’s.',
    csvAdjusted: '{text} (adjusted)',
    csvGroup: 'Group: {name}',
  },
  // In the action pages and the activity feed.
  action: {
    adjusted: 'one member adjusted | {n} members adjusted',
    cleared: 'Back to the group’s score',
    adds: 'Adds {names}',
    removes: 'Takes {names} off',
  },
  activity: {
    group: 'From a group’s grade',
    adjusted: 'Adjusted for this member',
    members: {
      added: 'Added to a group’s work',
      removed: 'Taken off a group’s work',
    },
  },
  // Refusals, by reason.
  refusal: {
    members_changed: 'Whose work this is has changed since the page was read. Read it again, then grade.',
    group_grade_posted:
      'A grade from this group’s grade has been posted: change it by regrading the group, or by adjusting one member’s grade.',
    grades_changed: 'A member’s grade was changed meanwhile. Read the page again, then try again.',
    not_a_member_of_work: 'An adjustment names someone who is not part of this work.',
    adjusted_below_zero: 'An adjustment brings a member’s score below zero.',
    adjusted_above_points:
      'An adjustment brings a member’s score above the points possible, which this group’s grade does not allow.',
    bad_adjustment: 'Each adjustment needs its points and a reason.',
    group_grade_partly_posted: 'Some members’ grades from the group’s grade are still drafts: post them first.',
    posted_meanwhile: 'The grade was posted while you were adjusting it. Adjust it again: it is a posted grade now.',
    not_from_a_group_grade: 'This grade was not given from a group’s grade.',
    not_a_group_assignment: 'This is not a group’s work.',
    part_of_other_work: 'A student you added is part of another group’s work for this assignment.',
    member_graded: 'A member you took off has a grade on this work, which stays theirs.',
    group_empty: 'At least one member has to stay.',
    not_a_student: 'Only a student of the course can be part of the work.',
  },
}
