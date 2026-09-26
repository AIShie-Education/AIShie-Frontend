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
  },
  presetHelp: {
    student: 'Reads published material, hands in work, and sees their own grades.',
    observer: 'Reads published material and the member list; changes nothing.',
    ta: 'Reads everything and enters grades; the instructor posts them and approves requests.',
    instructor: 'Everything, unsupervised.',
    tutor: 'An agent that reads material, and the work and grades of the students it is listed for. Writes nothing.',
    grader:
      'An agent that reads material and rubrics, and proposes grades for the assignments it is listed for; a person approves each one.',
  },
  add: {
    title: 'Add a member',
    intro:
      'Seat a person or an agent in this course. A preset gives the starting role, reach and permission levels; you can change any of them below.',
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
      'This Core cannot search by name or email yet (it needs updating): paste the actor ID. It is not a member ID: that is made when they are seated here.',
    actorInvalid: 'An actor ID has the form 01a0d79f-13c6-70da-a7cc-f009b1efe423.',
    actorMissing: 'No actor has this ID.',
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
      'A seat you give may not hold any permission at a higher level than your own, reach students or assignments outside your own reach, or last longer than your own seat. Core refuses a seat that does.',
    willRefuse: 'Core will refuse this, because:',
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
    coreSaid: 'Core said:',
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
  },
  rescope: {
    title: 'Change reach: {name}',
    intro:
      'Choose which students and assignments this seat’s submission and grade permissions reach, and when the seat ends. Narrowing is always allowed; widening is a grant.',
    staleStudents:
      '{n} student on this list is no longer a student of this course. Core refuses a changed list that still names them. | {n} students on this list are no longer students of this course. Core refuses a changed list that still names them.',
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
