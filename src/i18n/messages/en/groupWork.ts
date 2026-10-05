// Group work (an assignment its groups hand in, AIShie-Core #74): the
// assignment's form and page, a student's work as one of their group, a
// group's submission, and the roster by group.
export default {
  // An attribute of the assignment: its groups hand it in.
  tag: 'Group work',
  /** One member who is the reader, in a list of names ("Ken Wong and you"). */
  you: 'you',
  /** The reader, at the start of a sentence. */
  youStart: 'You',
  /** A member the page cannot name to the reader, in a sentence. */
  someone: 'someone in the course',
  states: {
    // A student in no group of the assignment's group set (the roster's state).
    no_group: 'In no group',
  },
  form: {
    label: 'Group work',
    toggle: 'Each group hands in one piece of work, for all its members',
    set: 'Group set',
    setPlaceholder: 'Choose a group set',
    setRequired: 'Choose the group set whose groups hand it in',
    groups: '{n} group | {n} groups',
    archived: 'archived',
    hint: 'Each group of the set hands in one piece of work for its members, and a student in no group of it hands nothing in. Whether it is group work, and of which set, can change only until someone starts on it.',
    locked: 'Someone has started on it, so whether it is group work, and of which group set, no longer changes.',
    noSets: 'This course has no group sets yet.',
    makeSet: 'Make one on the Groups page',
    unreadable: 'The course’s group sets cannot be read just now, so group work cannot be chosen here.',
  },
  // What the app says of each refusal about group work, by reason.
  refusal: {
    assignment_has_work:
      'Someone has started on this assignment (a draft, a hand-in or a record of missing work), so whether it is group work, and of which group set, no longer changes.',
    set_archived: 'That group set has been archived. Choose another, or bring it back first.',
    no_group:
      'You are in no group of this assignment’s group set, so there is nothing for you to start. Sign up to a group while sign-up is open, or ask your teacher to place you in one.',
    group_assignment: 'This is group work: a group is recorded as having handed in nothing, not one student.',
    group_empty: 'That group has nobody in it to record work for.',
    members_changed:
      'Your group’s members have changed since the page was read. Look at whom it is for now, and hand it in again.',
    draft_changed:
      'Someone in your group changed the draft after you started editing it. Load it as it is now, or keep your text and save it over theirs.',
    not_a_group_assignment: 'This assignment is not group work.',
  },
  // The assignment's page.
  page: {
    set: 'Group set',
    myGroup: 'Your group',
    noGroup: 'None yet',
  },
  // A student's work as one of their group (the assignment's page).
  work: {
    group: 'Your group',
    members: 'Members',
    noGroupTitle: 'You are in no group yet',
    noGroupBody:
      'This is group work: each group of “{set}” hands in one piece of work for its members. You are in no group of it, so there is nothing for you to start or hand in.',
    noGroupBodyNoSet:
      'This is group work: each group hands in one piece of work for its members. You are in no group yet, so there is nothing for you to start or hand in.',
    signupUntil: 'Sign-up is open until {closes}: choose a group to join.',
    signupOpen: 'Sign-up is open: choose a group to join.',
    signupWhere: 'Groups are joined on the course’s Groups page.',
    askTeacher: 'Sign-up is not open. Ask your teacher to place you in a group.',
    chooseGroup: 'Choose a group',
    noGroupNow: 'What you handed in with a group before is listed below.',
    start: 'Start your group’s draft',
    startHint:
      'Your group writes one draft together: every member can change it, and any member hands it in for the group.',
    alreadyStarted: 'Someone in your group has started the draft already: here it is.',
    text: 'Your group’s answer',
    revised: 'Last changed by {name}, {when}',
    conflictTitle: '{name} changed the draft {when}, while you were editing it',
    conflictBody:
      'Load the draft as it is now, which drops your changes here, or keep editing yours: saving it then replaces what they wrote.',
    conflictLoading: 'Reading the draft as it is now…',
    showTheirs: 'What the draft says now',
    loadTheirs: 'Load it as it is now',
    keepMine: 'Keep editing mine',
    resolveFirst: 'First load the draft as it is now, or keep editing yours.',
    handedInByOther: '{name} has handed the draft in.',
    handedInByOtherUnsaved:
      '{name} has handed the draft in, without the changes you had not saved. They are kept below, for you to copy.',
    // The student was moved out of the group (or out of the set) while its draft was open.
    notInGroupNow: 'You are no longer in {group}, so its draft is not yours to change or hand in any more.',
    notInGroupNowUnnamed:
      'You are no longer in the group whose draft this was, so it is not yours to change or hand in any more.',
    // What the student typed into the group's draft and did not save, where the draft is no longer theirs.
    keptTitle: 'What you had not saved',
    keptHint:
      'It is in no draft, and is kept only on this page until you discard it. Copy it if you want to use it again.',
    keptCopyFailed: 'It could not be copied automatically. Select the text and copy it yourself.',
    keptDiscard: 'Discard it',
    keptDiscardTitle: 'Discard what you had not saved?',
    keptDiscardBody: 'It is kept nowhere else, so it cannot be brought back.',
    changedBeforeHandIn:
      'The draft changed before it was handed in: {name} changed it {when}. Read it again, then hand it in.',
    handInTitle: 'Hand in attempt {n} for {group}?',
    handInFor: 'It is handed in for {names}: from then on it is their work, whatever changes in the group afterwards.',
    handInLeftOutMe: 'You will be left out of it: you are part of {group}’s work for this assignment already.',
    handInFixed: 'Once handed in, it cannot be changed: to change it later, your group starts a new attempt.',
    handedInFor: 'Handed in for {names}.',
    handedInForLate: 'Handed in for {names}, and marked late.',
    leftOutMe:
      'You were left out of it: you are part of another group’s work for this assignment. Your teacher can change whose work it is.',
    leftOut:
      '{names} was left out of it: they are part of another group’s work for this assignment. Your teacher can change whose work it is. | {names} were left out of it: they are part of another group’s work for this assignment. Your teacher can change whose work it is.',
    notPartNow:
      'Your work for this assignment is what you handed in with {group}. What your group hands in now leaves you out; your teacher can change whose work it is.',
    handedInBy: 'Handed in by {name}',
    forMembers: 'For {names}',
    recordedFor: 'Recorded as missing for {names}',
  },
  // The assignment's roster, by group.
  roster: {
    view: 'Show',
    byGroup: 'By group',
    byStudent: 'By student',
    chipsLabel: 'Groups by where their work stands',
    group: 'Group',
    members: 'Members now',
    handedIn: 'Handed in',
    handedInFor: 'Handed in for {names}',
    missingFor: 'Recorded as missing for {names}',
    workOf: '{group}’s work',
    nobody: 'Nobody in it',
    handedInBy: 'by {name}',
    empty: 'The group set has no groups yet.',
    emptyStudent: 'This student is in no group listed here.',
    noGroupTitle: 'In no group: {n} student | In no group: {n} students',
    noGroupNote:
      'They hand nothing in for this assignment and are not recorded as missing. Place each in a group of the set: a group of one is a group.',
    noGroupMore: 'More students may be on pages not loaded yet.',
    // Under a group's members, to a seat listed to some students: those of its members it does not reach.
    unreached: '{n} more member your seat does not reach | {n} more members your seat does not reach',
    // The same, where it is why the group cannot be recorded missing from here: that takes every member.
    unreachedMissing:
      '{n} more member your seat does not reach, so someone whose seat reaches every member records the group as missing | {n} more members your seat does not reach, so someone whose seat reaches every member records the group as missing',
    openSet: 'Open the group set',
    recordMissing: 'Record missing',
    confirmTitle: 'Record {group} as missing?',
    confirmBody:
      '{group} will be recorded as having handed in nothing for “{assignment}”, for its members now: {names}. It can then be graded. If the group hands work in later, that takes the record’s place.',
    done: '{group} recorded as missing.',
    noGroupCell: 'None',
  },
  // The list of submissions.
  list: {
    whose: 'Whose work',
  },
}
