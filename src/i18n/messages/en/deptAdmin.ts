// Departments as a tree, their administrators, and what a department's
// administrator does from the administration pages: courses and departments
// beneath their appointments, and finding, inviting and seating people by
// email. Nothing here reaches inside a course.
export default {
  tree: {
    subtitle:
      'The departments you administer, and everything beneath them. You make departments beneath yours, and rename, move and staff the ones beneath your appointment.',
    newTop: 'New top-level department',
    newChild: 'New department here',
    newTopTitle: 'New top-level department',
    newChildTitle: 'New department under {name}',
    rename: 'Rename',
    renameTitle: 'Rename {name}',
    move: 'Move',
    moveTitle: 'Move {name}',
    moveIntro:
      'Everything beneath it moves with it, departments and courses, and so does who administers them: whoever administered them only through a department that is no longer above them stops at once, and the administrators of the department it joins start. Nothing inside its courses changes.',
    moveTo: 'Move it under',
    movePick: 'Choose where it goes',
    moveNone: 'There is nowhere you administer that it could go.',
    top: 'Top of the tree',
    under: 'Under',
    atTop: 'At the top of the tree',
    name: 'Name',
    namePlaceholder: 'e.g. Department of Computing',
    courses: 'Courses',
    admins: 'Administrators',
    yours: 'You administer this',
    inPath: 'in {path}',
    depthLimit: 'Departments nest at most {n} levels deep.',
    created: 'Department created',
    renamed: 'Department renamed',
    moved: 'Department moved',
    viewCourses: 'Courses directly in {name}',
    viewAdmins: 'Administrators of {name}',
    more: 'What you can do with {name}',
    empty: 'You administer no department.',
    notHere: {
      here: 'where it is now',
      tooDeep: 'too deep for what moves with it',
      nameTaken: 'a department there has its name',
    },
  },

  admins: {
    title: 'Administrators of {name}',
    intro:
      'They administer every course in this department and beneath it from the administration pages, as a platform administrator does: they create, change, open, archive and move those courses and seat their instructors. They also make, rename, move and staff the departments beneath it. An appointment gives no seat in any course: to work inside one, they seat themselves like anyone else.',
    here: 'Appointed here',
    above: 'Through {dept}',
    appointedBy: 'Appointed by {name}, {date}',
    removedBy: 'Ended by {name}, {date}',
    ended: 'Ended',
    none: 'No administrators are appointed here.',
    add: 'Appoint an administrator',
    addHint: 'Find the person by their whole email address. Only a person can be appointed, never an agent, and nobody appoints themselves.',
    appoint: 'Appoint {name}',
    remove: 'End appointment',
    removeTitle: 'End {name}’s appointment?',
    removeConfirm:
      '{name} stops administering {dept} at once. What they did stays on record. If they administer it through a department above as well, they keep that.',
    added: '{name} is appointed',
    removed: '{name}’s appointment has ended',
    cannotHere: 'Administrators of this department are appointed by whoever administers the department above it.',
    cannotTop: 'Administrators of a department at the top of the tree are appointed by a platform administrator.',
    showRemoved: 'Show past appointments',
    coveredAbove:
      '{name} already administers it through a department above; this appointment keeps it theirs if that one ends.',
    blocked: {
      self: 'Nobody appoints themselves.',
      agent: 'Only a person can administer a department, never an agent.',
      suspended: 'This account is suspended, and cannot be appointed.',
      already: 'They administer this department already.',
    },
  },

  lookup: {
    email: 'Email',
    placeholder: "name{'@'}example.edu",
    hint: 'The person’s whole email address. There is no partial search.',
    find: 'Find',
    notFound: 'Nobody is registered with that email. You can invite them.',
    notFoundPlain: 'Nobody is registered with that email.',
    suspended: 'This account is suspended.',
    notSignedIn: 'Has not signed in yet.',
    invitePending: 'Invited, until {date}',
    inviteExpired: 'Their invitation expired {date}',
  },

  invite: {
    new: 'Invite someone new',
    title: 'Invite a new person',
    intro:
      'They are registered, and given a link to choose their password with. Hand them the link yourself: AIshie sends no email.',
    name: 'Name',
    namePlaceholder: 'Chan Tai Man',
    email: 'Email',
    submit: 'Register and invite',
    again: 'Invite again',
    againHint: 'They have not signed in yet. A new link replaces the one they were given.',
    seatThem: 'Seat {name} as instructor',
    emailTaken: 'That email is already registered. Seat that person instead.',
    done: '{name} is registered and invited',
  },

  courses: {
    subtitle: 'Courses in the departments you administer, and beneath them',
    within: 'Include sub-departments',
    noTerms: 'There are no terms yet. A platform administrator creates them.',
  },

  course: {
    move: 'Move to another department',
    moveTitle: 'Move {code}',
    moveIntro:
      'Its members, their seats and everything in it stay as they are. Who administers it changes with its department: the administrators of the department it leaves who do not administer the one it joins stop at once.',
    moveTo: 'Department',
    moved: 'Moved to {dept}',
    notSeated:
      'You are not seated in this course, so its own pages will refuse you: administrators manage courses from here, not from inside. Seat yourself as instructor below to work in it.',
  },

  home: {
    explain:
      'Administering a department does not open its courses: what anyone sees inside one comes from their seat in it. To open one of these, seat its instructor, or yourself, on its administration page.',
  },

  noSeat: {
    body: 'Administering its department does not open a course: what anyone sees inside one comes from their seat in it. Seat this course’s instructor, or yourself, on its administration page.',
  },

  // Refusals, by the reason Core gives (details.reason).
  errors: {
    department_out_of_scope: 'That is outside the departments you administer.',
    destination_out_of_scope:
      'It can go only to a department you administer; the top of the tree is a platform administrator’s.',
    name_taken: 'Another department there already has that name.',
    same_name: 'It already has that name.',
    too_deep: 'That would nest departments more than {max_depth} levels deep.',
    cycle: 'A department cannot go under itself, or under a department beneath it.',
    same_parent: 'It is there already.',
    same_department: 'The course is in that department already.',
    not_a_person: 'Only a person can administer a department, never an agent.',
    actor_suspended: 'That account is suspended.',
    self_appointment: 'Nobody appoints themselves.',
    already_admin: 'They administer this department already.',
    not_admin: 'They do not administer this department.',
    email_taken: 'That email is already registered. Seat that person instead.',
    invite_not_allowed:
      'You can invite someone again only while they have never signed in and hold nothing beyond the departments you administer. Ask a platform administrator.',
    // Why actor.invite refused a department administrator (details.why).
    inviteWhy: {
      signed_in:
        'They have signed in before, and a new invitation would replace their password. Only a platform administrator can do that: ask one if they have forgotten it.',
      platform_role: 'They are a platform administrator. Only another platform administrator can invite them.',
      not_a_person: 'This is an agent, not a person: an agent is given an API token, not an invitation.',
      administers: 'They administer a department themselves. Only a platform administrator can invite them.',
      owns_agents: 'They own agents, which an invitation would hand over too. Only a platform administrator can invite them.',
      seated_elsewhere:
        'They have seats in courses outside the departments you administer. Only a platform administrator can invite them.',
    },
  },
}
