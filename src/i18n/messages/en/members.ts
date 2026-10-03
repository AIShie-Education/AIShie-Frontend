export default {
  title: 'Members',
  subtitle:
    'Everyone seated in this course, people and agents alike, each with their own permissions, reach and lifetime.',
  addMember: 'Add member',
  expired: 'Ended',
  empty: 'No members match these filters.',
  emptyAgents: 'No agents are seated in this course.',
  emptyAgentsSoFar: 'No agents among the first {n} members. Load more to look through the rest.',
  emptyPeopleSoFar: 'No people among the first {n} members. Load more to look through the rest.',
  partialCounts: 'The counts cover the members loaded so far. Load more to see everyone.',
  agentsHint: 'Course agents, how their replies reach students, and whether students may bring their own agents:',
  agentsPage: 'Agents page',
  loginId: 'Student/staff number',
  noLoginId: 'None',
  loginIdHelp: 'What they sign in with, as well as an email; only an administrator changes it.',
  tabs: {
    all: 'All',
    people: 'People',
    agents: 'Agents',
  },
  filters: {
    anyRole: 'Any role',
    includeRemoved: 'Show removed',
  },
  columns: {
    name: 'Name',
    role: 'Role',
    status: 'Status',
    scope: 'Reach',
    preset: 'Preset',
    expires: 'Seat ends',
    dates: 'Dates',
    added: 'Added',
  },
  scope: {
    students: 'Students',
    assignments: 'Assignments',
    all: {
      students: 'All students',
      assignments: 'All assignments',
    },
    nobody: {
      students: 'Nobody',
      assignments: 'None',
    },
    allShort: 'All',
    listedUnknown: 'Listed',
    listedN: '{n} listed',
    ownWork: 'Own work',
    onlyThese: 'Only those listed',
  },
  proposed: {
    add: 'Your request to add a member is waiting for approval. They are not seated until someone approves it.',
    change: 'Your change is waiting for approval. The seat stays as it is until someone approves it.',
    view: 'View the request',
    mine: 'My actions',
  },
  presetNames: {
    student: 'Student',
    observer: 'Observer',
    ta: 'Teaching assistant',
    instructor: 'Instructor',
    tutor: 'Tutor (agent)',
    grader: 'Grader (agent)',
    delegate: 'Personal agent',
    course_tutor: 'Course agent',
  },
  presetHelp: {
    student: 'Reads published material, hands in work, and sees their own grades.',
    observer: 'Reads published material and the member list; changes nothing.',
    ta: 'Reads everything and enters grades; the instructor posts them and approves requests.',
    instructor: 'Everything, unsupervised.',
    tutor: 'An agent that reads material, and the work and grades of the students it is listed for. Writes nothing.',
    grader:
      'An agent that reads material and rubrics, and proposes grades for the assignments it is listed for; a person approves each one.',
    delegate:
      'Someone’s own agent: reads the material and its owner’s work and grades, and answers its owner’s questions. Never more than its owner’s seat.',
    course_tutor: 'An agent that answers students’ questions about the course material. Reads nobody’s work.',
  },
  add: {
    title: 'Add a member',
    intro:
      'Seat a person or an agent in this course. A preset gives the starting role, reach and permission levels; you can change any of them below. An agent that belongs to someone is not added here: its owner brings it in.',
    find: 'Find by name or email',
    findPlaceholder: 'Search people and agents',
    findNoMatch: 'No one matches.',
    actor: 'Actor ID',
    actorPlaceholder: 'e.g. 01a0d79f-13c6-70da-a7cc-f009b1efe423',
    actorHelp:
      'Every person and agent is registered once, by a platform administrator, who can tell you their actor ID. It is not a member ID: that is made when they are seated here.',
    actorHelpFound:
      'Filled in when you pick someone above; an actor ID can also be pasted. It is not a member ID: that is made when they are seated here.',
    noSearch:
      'This server cannot search by name or email yet (it needs updating): paste the actor ID. It is not a member ID: that is made when they are seated here.',
    findEmail: 'Find by student/staff number or email',
    emailPlaceholder: "20231234 or name{'@'}example.edu",
    findButton: 'Find',
    emailHelp:
      'Their whole student or staff number, or their whole email address, in upper or lower case: nobody is found by a part of one.',
    emailPartial:
      "Give their whole student or staff number, or their whole email address such as name{'@'}example.edu: a part of one finds nobody.",
    emailNobody:
      'Nobody is registered with that number or email. Ask a platform administrator to register them, then find them here.',
    actorHelpEmail:
      'Filled in when you find someone by email above. An agent has no email: ask a platform administrator, who can tell you their actor ID. It is not a member ID: that is made when they are seated here.',
    noSearchEmail:
      'This server cannot search by name or email yet (it needs updating), only by a whole email address: give one above, or paste the actor ID. It is not a member ID: that is made when they are seated here.',
    actorInvalid: 'An actor ID has the form 01a0d79f-13c6-70da-a7cc-f009b1efe423.',
    actorMissing: 'No actor has this ID.',
    alreadySeated: 'They already have a seat in this course. Change that seat rather than adding another.',
    openSeat: 'Open their seat',
    suspended: 'Suspended: nobody suspended can be seated until a platform administrator reinstates them.',
    ownedAgent: 'This agent belongs to {owner}, so it cannot be added here.',
    ownedAgentNoName: 'This agent belongs to someone, so it cannot be added here.',
    ownedAgentHelp:
      'An agent a person owns takes part only as their delegate: its owner brings it into the course themselves, and it never holds more than their seat. To add a course agent of your own, use the Agents page.',
    preset: 'Preset',
    presetsFailed: 'The presets could not be loaded.',
    builtIn: 'Built-in',
    department: "This course's department",
    role: 'Roster role',
    presetCopied: 'The preset is copied onto the seat: changing the preset later changes nobody already seated.',
    roleHelp:
      'The role is a roster fact: the gradebook lists the members whose role is Student. It grants nothing by itself; the permissions do.',
    reach: 'Reach',
    reachHelp:
      'Reach narrows the permissions that concern students and assignments (submissions and grades) to those listed. Course material is not narrowed.',
    studentScope: 'Which students',
    assignmentScope: 'Which assignments',
    pickStudents: 'Choose students',
    pickAssignments: 'Choose assignments',
    listsItself: "A student's seat with an empty list reaches that student only: they see their own work.",
    nobodyStudents:
      'Listed with nobody on the list reaches no student at all. Reach fails closed: choose students, or All.',
    nobodyAssignments: 'Listed with no assignments reaches no assignment at all. Choose assignments, or All.',
    expires: 'Seat ends',
    expiresNever: 'Never',
    expiresHelp: 'Optional. At this moment the seat removes itself.',
    myExpiry: 'Your own seat ends',
    expiresPast: 'Choose a moment in the future.',
    perms: 'Permissions',
    permsChanged: '{n} changed from the preset',
    permsAsPreset: 'as the preset gives them',
    permsHelp:
      "A permission left empty keeps the preset's level, shown in grey. Choose a level to set it differently for this seat.",
    capToMine: 'Lower {n} to my own levels',
    submit: 'Add member',
    submitProposal: 'Request to add',
    success: 'Member added',
  },
  grant: {
    rulesTitle: 'Nobody hands out more than they hold',
    rules:
      'A seat you give may not hold any permission at a higher level than your own, reach students or assignments outside your own reach, or last longer than your own seat. A seat that does is refused.',
    willRefuse: 'This will be refused, because:',
    permAbove: 'You hold “{perm}” at “{held}”; this seat would have it at “{wanted}”.',
    rowAbove: 'Higher than your own level, “{held}”',
    studentsAll: 'Your own reach is a list of students, so you cannot give a seat that reaches all students.',
    newStudent:
      'Your own reach is a list of students, and a new student’s seat reaches that student, who cannot be on your list yet.',
    studentsOutside: 'Some of the students listed are outside your own reach.',
    assignmentsAll: 'Your own reach is a list of assignments, so you cannot give a seat that reaches all assignments.',
    assignmentsOutside: 'Some of the assignments listed are outside your own reach.',
    outlives: 'Your own seat ends at {t}; this seat would last longer.',
  },
  refusal: {
    coreSaid: 'The server said:',
    permAbove:
      'You hold “{perm}” at “{held}” yourself, so you cannot give it at “{wanted}”. Lower that level, or ask someone who holds it to do this.',
    studentsAll: 'Your own reach is a list of students, so the seat must be limited to listed students too.',
    newStudent:
      'Your own reach is a list of students. A new student’s seat reaches that student, who is not on your list, so you cannot seat them.',
    studentsOutside: 'You can only list students who are within your own reach.',
    assignmentsAll: 'Your own reach is a list of assignments, so the seat must be limited to listed assignments too.',
    assignmentsOutside: 'You can only list assignments that are within your own reach.',
    outlives: 'Your own seat ends at {t}; you cannot give one that lasts longer. Set an end no later than yours.',
    ownSeat: 'Nobody manages their own seat. Ask another member who manages members.',
    ownPrincipal: 'An agent does not manage the seat of the person whose delegate it is.',
    ownedAgent:
      'This agent belongs to someone. Only its owner brings it into a course, as their delegate; it cannot be added as a member here.',
    principalCap:
      'This agent acts for someone who holds “{perm}” at “{held}”, and an agent never does more than its owner: it cannot have it at “{wanted}”.',
    principalScope: 'An agent reaches no further than its owner, whose own reach is narrower than that.',
    principalExpiry: 'An agent’s seat lasts no longer than its owner’s, which ends at {t}.',
    delegateNever: 'An agent seated as someone’s delegate never holds “{perm}”.',
    onSeat: '{text} (the seat of {name})',
    alreadySeated:
      'This actor already has a seat in this course. Change that seat instead, or remove it and add them again for a fresh start.',
    noActor: 'No actor has this ID. Check it with the administrator who registered them.',
    suspended:
      'This actor is suspended across the platform, and cannot be seated until an administrator reactivates them.',
    systemActor: 'The system actor is never seated in a course.',
    notStudents: 'Everyone on the student list must be a current student of this course.',
    notAssignments: 'Everything on the assignment list must be an assignment of this course.',
    pastExpiry: 'The end is in the past. To end a seat now, remove it.',
    removed: 'This seat has been removed (or has ended). Seat the actor again for a fresh start.',
    noPreset: 'That preset no longer exists.',
    otherDept: 'That preset belongs to another department.',
    wrongStatus: 'The seat changed while you were looking at it. Reload and try again.',
    nothing: 'Nothing was changed.',
    noManage: 'Your seat does not allow managing members here.',
    callerNotLive: 'Your own seat is paused or has ended, so nothing you do here is accepted.',
    // Core's refusals of a change to a seat, by the reason it names (details.reason).
    reason: {
      delegate_seat:
        'This seat is an agent’s, seated as someone’s delegate: its role is fixed, and it is on no roster. Its role does not change.',
      not_your_principal:
        'An agent does not manage the seat of the person it acts for, nor the seats of their other agents.',
      // member.reset_password
      people_only: 'A password is reset by a person, who hands it on: an agent is never given one.',
      not_autonomous:
        'You manage members here only with approval or review, and a password is not reset that way. Ask someone who manages members without approval.',
      not_by_proposal:
        'A password is never reset by a request for approval: it is shown once, to whoever resets it. Ask someone who manages members without approval.',
      own_seat: 'That is your own seat: set your own password on your Account page.',
      not_a_person: 'That seat is an agent’s, which signs in with a token and has no password.',
      not_a_student: 'Only a student’s password is reset here. Anyone else’s is an administrator’s to reset.',
      seat_not_active: 'Their seat is not active (paused, removed or ended). Resume it first, or ask an administrator.',
      seated_other_than_student:
        'They hold a seat other than a student’s in some course, so their password is an administrator’s to reset.',
      platform_role: 'They hold a platform role, so their password is an administrator’s to reset.',
      administers: 'They administer a department, so their password is an administrator’s to reset.',
      sso_linked: 'They sign in through the school’s identity provider, whose password is not this system’s to set.',
      no_sign_in_name:
        'They have neither a student/staff number nor an email to sign in with. An administrator gives them one first.',
      beyond_your_seat:
        'Their seat holds more than your own seat does, and whoever holds the password holds the seat. Ask someone who holds at least as much.',
    },
  },
  // member.reset_password: a temporary password for a student.
  reset: {
    action: 'Reset password',
    title: 'Reset the password of {name}?',
    intro: 'A new, temporary password is made for {name}, for you to hand to them. Their old password stops working.',
    sessions: 'Every session {name} has is signed out now.',
    mustChange:
      'The next time {name} signs in, with it, they must choose a password of their own before anything else.',
    shownOnce: 'The temporary password is shown to you once, here, and kept nowhere.',
    onlyStudents:
      'Only for a student whose account reaches nothing beyond a student’s seat: anyone else’s password is an administrator’s to reset.',
    submit: 'Reset password',
    resultTitle: 'Temporary password for {name}',
    onceTitle: 'Shown only now',
    once: 'It is not stored, and cannot be shown again. Hand it to them in person or through a private message — never in a class group or any public channel.',
    signInWith: 'They sign in with',
    theirEmail: 'Their email',
    password: 'Temporary password',
    copied: 'Copied',
    copiedShort: 'Copied',
    copyFailed: 'The browser did not let it be copied: select it and copy it by hand.',
    replayed:
      'The password was set, but this answer was a repeat of an earlier request, which does not show it again. Reset it again to get a new one.',
    ended: 'They had no session open. | Their {n} session was signed out. | Their {n} sessions were signed out.',
    next: 'At the next sign-in, {name} chooses their own password.',
    close: 'Done',
  },
  role: {
    change: 'Change role',
    title: 'Change the roster role of {name}',
    current: 'Role now:',
    newRole: 'New role',
    isCurrent: 'Current',
    onlyRoleTitle: 'This changes the roster role only',
    onlyRole:
      'The role says who is on the gradebook and hands work in. It grants nothing: {name}’s permissions and reach stay exactly as they are. To change what this seat may do or whom it reaches, change those as well.',
    effect: {
      leavesRoster:
        '{name} leaves the roster: no longer listed as a student, not marked missing when a due date passes, and handing in nothing new. What they handed in and every grade they were given stay, and work already handed in may still be graded.',
      joinsRoster:
        '{name} joins the roster: listed as a student, handing work in and graded, and may be listed in other seats’ reach.',
      nameOnly: 'Only the name on the roster changes: {name} is on no gradebook either way.',
    },
    submit: 'Change to {role}',
    submitNone: 'Choose a role',
    done: '{name} is now {role}',
    unchanged: '{name} was {role} already: nothing changed.',
    blocked: {
      delegateSeat: 'An agent seated as someone’s delegate has a fixed role, and is on no roster.',
      agent: 'An agent’s seat is on no roster: its role does not change here.',
      notYourPrincipal: 'This is the seat of the person you act for: an agent does not manage it.',
    },
  },
  rescope: {
    title: 'Change reach: {name}',
    intro:
      'Choose which students and assignments this seat’s submission and grade permissions reach, and when the seat ends. Narrowing is always allowed; widening is a grant.',
    staleStudents:
      '{n} student on this list is no longer a student of this course. A changed list that still names them is refused. | {n} students on this list are no longer students of this course. A changed list that still names them is refused.',
    dropStale: 'Take them off the list',
    currently: 'Currently:',
    keep: 'Keep',
    setEnd: 'Set an end',
    clear: 'Never end',
    expiryHelp: 'Moving the end later, or removing it, is a grant. To end a seat now, remove it instead.',
    isGrant:
      'This widens the seat, so it is a grant: everything the seat will then hold must be within what you hold yourself.',
    nothing: 'Nothing changed yet',
    success: 'Reach updated',
  },
  detail: {
    title: 'Member',
    selfShort: 'This is your own seat; nobody manages their own seat.',
    self: 'This is your own seat. Nobody manages their own seat, not even to narrow it, so the controls here are off. Ask another member who manages members.',
    removed:
      'This seat has been removed. Everything done from it stays on record. Seating the same actor again makes a new seat with a new member ID.',
    expired:
      'This seat has passed its end and counts as removed, even if it still shows another status. It can only be read; seat the actor again for a fresh start.',
    paused:
      'This seat is paused: every call made from it is refused until it is resumed. Its pending requests stay queued but cannot be approved meanwhile.',
    seat: 'Seat',
    actor: 'Actor',
    actorId: 'Actor ID',
    actorAdmin: 'Open in administration',
    roleHelp: 'A roster fact; it grants nothing by itself.',
    noExpiry: 'Never',
    expiresHelp: 'At this moment the seat removes itself.',
    memberId: 'Member ID',
    memberIdHelp:
      'This seat’s own ID. It stays the same while the seat is paused and resumed; removing the seat and adding the person again gives a new one.',
    memberIdAgent:
      'This seat’s own ID. An agent keys its memory of this course on it: pausing and resuming keeps the same relationship, while removing and re-adding gives a new ID and a fresh start.',
    approvalNote: 'Your seat needs approval for this, so it will wait for someone to approve it.',
    delegate: {
      actsFor: 'Acts for',
      help: 'Its owner’s seat in this course. The agent never holds more than that seat, reaches no further, is paused while it is, and leaves the course with it.',
      permsHelp:
        'The levels below are this agent’s own. What it may do is also capped by its owner’s seat, and it never brings in agents of its own: each permission capped says how far it may go and why, and nothing above that is offered.',
      never: 'An agent seated as someone’s delegate never holds this',
      theirAgents: 'Their agents here',
      theirAgentsHelp: 'Agents this member brought into the course. Each acts only for them, and leaves with them.',
      removeToo: 'Their agent here leaves the course with them. | Their {n} agents here leave the course with them.',
    },
    work: {
      title: 'Their work:',
      gradebook: 'Gradebook',
      submissions: 'Submissions',
      grades: 'Grades',
    },
    scope: {
      title: 'Reach',
      change: 'Change reach',
      help: 'Reach narrows the permissions about students’ work (submissions and grades). A listed reach with nothing on the list reaches nothing.',
      helpStudent:
        'Reach narrows the permissions about students’ work (submissions and grades). This student’s seat lists only the student themself, as an empty list does when a student is added, so they see their own work and nobody else’s.',
      allStudents: 'Every student in the course.',
      noStudents: 'Nobody: the list is empty, so these permissions reach no student.',
      ownWork: 'Only their own work.',
      allAssignments: 'Every assignment in the course.',
      noAssignments: 'None: the list is empty, so these permissions reach no assignment.',
    },
    perms: {
      title: 'Permissions',
      edit: 'Edit permissions',
      help: 'Each permission is held at one level on the ladder from Denied to Autonomous.',
      differs:
        '{n} permission differs from the preset “{preset}” it was copied from. | {n} permissions differ from the preset “{preset}” they were copied from.',
      asPreset: 'All as the preset “{preset}” gave them.',
      editHelp:
        'Lowering a level is always allowed. Raising one is a grant: everything the seat will then hold, over its whole reach and for as long as it lasts, must be within what you hold yourself. Changes apply from the member’s next call.',
      changes: '{n} changed',
      unchanged: 'Nothing changed yet',
      saved: 'Permissions updated',
    },
    pause: {
      title: 'Pause this seat?',
      action: 'Pause',
      confirm:
        'Every call {name} makes here will be refused until the seat is resumed. The seat keeps its ID, permissions and history; for an agent, the relationship carries on afterwards. Their pending requests stay queued but cannot be approved while paused.',
      success: '{name} is paused',
    },
    resume: {
      title: 'Resume this seat?',
      action: 'Resume',
      confirm:
        '{name} gets back everything this seat holds, exactly as before. That is a grant of the whole seat, so it must be within what you hold yourself.',
      success: '{name} is resumed',
    },
    remove: {
      title: 'Remove this member?',
      action: 'Remove',
      confirm:
        '{name} will leave the course. Everything done from this seat stays on record, and any request of theirs still waiting for approval is cancelled.',
      confirmFresh:
        'This cannot be undone. Seating them again later makes a new seat with a new ID; for an agent, a fresh start.',
      success: '{name} was removed',
      cancelled:
        'Removed. {n} pending request of theirs was cancelled. | Removed. {n} pending requests of theirs were cancelled.',
      noneCancelled: 'Removed. They had no pending requests to cancel.',
      fresh: 'Seating them again later makes a new seat with a new member ID.',
    },
  },
}
