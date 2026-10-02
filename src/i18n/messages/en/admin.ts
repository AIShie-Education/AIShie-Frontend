// Platform administration: courses and actors.
export default {
  nav: {
    courses: 'Courses',
    actors: 'People & agents',
    terms: 'Terms',
    departments: 'Departments',
    presets: 'Permission presets',
    sso: 'Sign-in',
    runtime: 'AI and documents',
    export: 'Export conversations',
  },

  courses: {
    title: 'Courses',
    subtitle: 'Every course offering on the platform, in every term and department',
    create: 'New course',
    term: 'Term',
    dept: 'Department',
    allTerms: 'All terms',
    allDepts: 'All departments',
    col: {
      course: 'Course',
      status: 'Status',
      term: 'Term',
      dept: 'Department',
      created: 'Created',
    },
    empty: 'No courses yet. Create the first one.',
    emptyFiltered: 'No course matches these filters.',
    needSetup: 'A course belongs to a term and a department, and there is none of one yet.',
    noTerms: 'There are no terms yet.',
    noDepts: 'There are no departments yet.',
    goTerms: 'Create a term',
    goDepts: 'Create a department',
    unknown: 'Unknown',
    termDates: '{from} – {to}',
    setupFailed: {
      terms: "The terms could not be loaded, so no course can be created and the list cannot show each course's term.",
      depts:
        "The departments could not be loaded, so no course can be created and the list cannot show each course's department.",
      both: 'The terms and departments could not be loaded, so no course can be created and the list cannot show them.',
    },
  },

  create: {
    title: 'New course',
    intro:
      'One offering of a course in one term: another section is another course. It starts as a draft with no members; seat its first instructor next.',
    dept: 'Department',
    term: 'Term',
    code: 'Code',
    codePlaceholder: 'CS101',
    section: 'Section',
    sectionPlaceholder: 'A',
    sectionHint: 'Leave empty when there is only one section. Code and section must be unique within the term.',
    courseTitle: 'Title',
    titlePlaceholder: 'Introduction to Programming',
    description: 'Description',
    submit: 'Create course',
    done: 'Course {code} created',
  },

  course: {
    title: 'Course administration',
    notFound: 'There is no course with this ID.',
    details: 'Details',
    code: 'Code',
    section: 'Section',
    noSection: 'None',
    term: 'Term',
    dept: 'Department',
    status: 'Status',
    created: 'Created',
    id: 'Course ID',
    description: 'Description',
    noDescription: 'No description.',
    edit: 'Edit',
    editTitle: 'Edit course',
    editHint: "A course's code, section and term are what it is, and do not change.",
    courseTitle: 'Title',
    saved: 'Course updated',
    nothingChanged: 'Nothing was changed.',
    activate: 'Activate',
    reopen: 'Reopen',
    activated: 'The course is active',
    reopenTitle: 'Reopen {code}?',
    reopenConfirm:
      'Its members can work in it again. Seats that expired, proposals that went stale and due dates that passed while it was archived are dealt with now.',
    archive: 'Archive',
    archiveTitle: 'Archive {code}?',
    archiveConfirm:
      'From then on the course refuses every write, from everyone, agents included: no material, submissions, grades or approvals, and no changes here. Everything in it stays readable, and it can be reopened later.',
    archived: 'The course is archived',
    statusHelp: {
      draft:
        'A draft: its instructor can seat members and prepare material before it opens. Activate it when it starts.',
      active: 'Active: open for work.',
      archived: 'Archived: it refuses every write, these settings included. Reopen it to change anything.',
    },
    openCourse: 'Open course',
    seatedAs: 'You are seated in this course as {role}.',
    notSeated:
      'You are not seated in this course, so its own pages will refuse you: platform administrators govern courses from here, not from inside. Seat yourself as instructor below to work in it.',
  },

  seat: {
    title: 'Seat the instructor',
    intro:
      "A new course has no members until its first instructor is seated here. They get the built-in instructor preset, and add everyone else from the course's Members page.",
    seatedTitle: 'Instructors',
    hasMembers: "This course has members. Its instructors add everyone else from the course's Members page.",
    noInstructorsIntro:
      "This course has members, but no instructor at the moment. Seat one here: they get the built-in instructor preset, and add everyone else from the course's Members page.",
    seatedJustNow: 'seated just now',
    notListed:
      'You have no seat in this course, so its member list cannot be read here: only whom you seat from this page is shown.',
    cannotList: 'Your seat in this course cannot read its member list, so its instructors are not shown here.',
    listFailed: 'The member list could not be read just now.',
    membersPage: 'Go to the Members page',
    membersPageNeedsSeat:
      "The course's own pages, Members included, open only to its members. Seat yourself to work in it.",
    another: 'Seat another instructor',
    who: 'Instructor',
    placeholder: 'Search by name or email, or paste an ID',
    placeholderId: 'Paste an actor ID',
    noMatch: 'No one matches.',
    pasteId: 'Paste the whole actor ID.',
    noSearch: 'This Core cannot search by name or email yet (it needs updating): paste the actor ID instead.',
    suspended: 'They are suspended, and Core does not seat anyone suspended. Reactivate them first.',
    system: 'The system account runs background jobs and is never seated in a course.',
    alreadySeated: 'You have a seat in this course already, and Core does not seat anyone twice.',
    agent: 'This is an agent. Seated as instructor, it holds every permission of the instructor preset.',
    submit: 'Seat as instructor',
    done: '{name} is seated as instructor',
    doneHint: "Seated with the built-in instructor preset. They add everyone else from the course's Members page.",
    memberId: 'Member ID',
    archived: 'An archived course takes no new members. Reopen it first.',
    me: 'Me',
    registerFirst: 'Not registered yet? Register them first.',
  },

  actors: {
    title: 'People & agents',
    subtitle:
      'Everyone registered on the platform: find them, register someone new, and manage their standing and how they sign in',
    register: 'Register',
    search: 'Search',
    searchPlaceholder: 'Search by name, email or student/staff number, or paste an ID',
    allKinds: 'All kinds',
    anyStatus: 'Any status',
    kinds: {
      human: 'People',
      agent: 'Agents',
    },
    col: {
      name: 'Name',
      kind: 'Kind',
      email: 'Email / number',
      status: 'Status',
      role: 'Platform role',
      signIn: 'Sign-in',
      registered: 'Registered',
      owner: 'Owner',
    },
    registeredOn: 'Registered {date}',
    noOwner: 'No owner',
    ownerIs: 'Owned by {owner}',
    ownedBy: 'Agents owned by {owner}',
    empty: 'No one is registered yet.',
    emptyFiltered: 'No one matches.',
    byId: 'Found by ID. Press Enter to open their page.',
    notFound: 'No person or agent has this ID.',
    noList: {
      title: 'This Core cannot list people and agents yet',
      body: 'Browsing and searching them needs a newer AIshie Core, one with actor.list. Until the server is updated, open a person or agent by their actor ID, or register someone new.',
    },
    openById: {
      title: 'Open a person or agent by ID',
      placeholder: 'Actor ID',
      submit: 'Open',
      invalid: 'This is not an actor ID.',
      hint: 'Registering someone shows their ID, and a course member’s page shows the actor ID of whoever holds the seat.',
    },
  },

  signIn: {
    password: 'Password',
    sso: 'Single sign-on',
    invitedUntil: 'Invited until {date}',
    inviteExpired: 'Invitation expired',
    cannot: 'No password or single sign-on yet',
  },

  registered: {
    title: '{name} is registered',
    id: 'Actor ID',
    open: 'Open their page',
    dismiss: 'Dismiss',
    nextSteps: 'Next steps',
    human: {
      invite:
        'Create an invitation link on their page and send it to them: with it they choose a password and are signed in. Where single sign-on is used, you can link their identity there instead.',
      email:
        'Give them a student/staff number or an email first, on their page: a password is always entered with one. Then create an invitation link there. Where single sign-on is used, you can link their identity instead.',
      seat: "Seat them in a course: as its first instructor from the course's administration page, or ask the course's instructor to add them.",
      inviteButton: 'Create an invitation link',
      emailButton: 'Give them a number or an email',
    },
    agent: {
      token: 'Issue it an API token on its page. The token is shown once.',
      seat: 'Have a course instructor seat it (Members → Add) with a preset such as grader or tutor, scoped to the students or assignments it serves.',
      connect: 'Point its MCP client at {endpoint}, with the token as a bearer token.',
      runtime:
        'No token is issued for it here: the site’s agent runtime runs it once the runtime’s operator names it by this ID, and is issued its token itself.',
    },
    ownedAgent: {
      owner:
        '{owner} owns it: they give it tokens and bring it into their courses from their own My agents page, as their delegate.',
      ownerRuntime:
        '{owner} owns it: they host it on AIshie and bring it into their courses from their own My agents page, as their delegate.',
      seat: 'It is never seated from Members → Add: in each course it holds no more than its owner’s seat.',
    },
  },

  register: {
    title: 'Register a person or agent',
    intro: 'Someone registered can do nothing until seated in a course.',
    introAdmin:
      'An administrator manages the platform (courses, people and agents, terms, departments and presets) without any seat. Inside a course they can do nothing until they are seated, like anyone else.',
    kind: 'Kind',
    kindHelp: {
      human: 'Signs in with a password they choose from an invitation link, or with single sign-on.',
      agent: 'Hosted on AIshie, or reached over MCP with API tokens, as chosen below. No endpoint, model or prompt is stored here.',
    },
    hostingRuntime: 'The site’s agent runtime alone is issued its token: nobody is issued one here.',
    hostingMcp: 'Issue it API tokens on its page once it is registered, for whatever reaches it over MCP.',
    displayName: 'Display name',
    namePlaceholder: {
      human: 'Chan Tai Man',
      agent: 'grader-v2',
    },
    email: 'Email',
    emailHint:
      'What they sign in with, with the password they choose from an invitation. It can be given or changed later, not removed. An email belongs to one person only.',
    admin: 'Platform administrator',
    adminHint:
      'Administrators create courses and register and manage people and agents. Inside courses they are governed by their seats like anyone else. It can be given only now, when registering.',
    adminRootOnly: 'Only root can make an administrator.',
    adminOwned: 'An agent someone owns holds no platform role: leave the owner empty to make it an administrator.',
    permanent:
      'The kind, the platform role, an agent’s owner and how it runs cannot be changed after registering. The name and the email can be corrected on their page.',
    owner: 'Owner',
    ownerHint:
      'Leave empty for an agent that course managers seat themselves. With an owner, it acts only as that person’s delegate: they bring it into their courses, and it never holds more than their seat. The owner is given now or never: it cannot be added, changed or taken away later.',
    ownerHintSet:
      'It acts only as this person’s delegate: they give it tokens and bring it into their courses from My agents. It never holds more than their seat, and it is theirs for good: nobody changes its owner later.',
    submit: 'Register',
    done: '{name} is registered',
    sameName:
      '{n} person or agent is already registered as “{name}”. | {n} people or agents are already registered as “{name}”.',
    sameNameHint:
      'Registering makes another, separate one with the same name, told apart only by its ID. Check it is not already here, or choose a name that tells them apart.',
    sameNameUnchecked:
      'Many names or emails contain “{name}”: only the {n} registered first were checked for the same name.',
  },

  actor: {
    title: 'Person or agent',
    registration: 'Registration',
    id: 'Actor ID',
    kind: 'Kind',
    name: 'Display name',
    email: 'Email',
    noEmail: 'None',
    status: 'Status',
    platformRole: 'Platform role',
    noRole: 'None',
    created: 'Registered',
    createdBy: 'Registered by',
    noCreator: 'Nobody: created when the platform was installed',
    signIn: 'How they sign in',
    edit: 'Edit',
    you: 'This is you.',
    seatsHint:
      "Seats are given per course: as a course's first instructor from its administration page, or by the course's instructor on its Members page.",
    suspend: 'Suspend',
    reactivate: 'Reactivate',
    suspendTitle: 'Suspend {name}?',
    suspendConfirm:
      'Every call they make is denied from now on, in every course, and they cannot sign in; this goes for agents too. Their seats, history and credentials are kept, and reactivating restores them as they were.',
    suspended: '{name} is suspended',
    reactivateTitle: 'Reactivate {name}?',
    reactivateConfirm: 'Their seats and credentials work again as they were.',
    reactivated: '{name} is active again',
    suspendedBanner: 'Suspended: every call they make is refused, in every course, and they cannot sign in.',
    suspendedByOwnerBanner:
      'Its owner suspended it, and may lift that themselves. Reactivating it here lifts it as well; taking the suspension over makes it yours, and then its owner cannot lift it.',
    suspendedBy: 'Suspended by',
    itsOwner: 'its owner',
    suspendedByUnrecorded: 'Not recorded (counts as an administrator’s)',
    takeOver: 'Take over the suspension',
    takeOverHint: 'Make the suspension an administrator’s, so that its owner can no longer lift it.',
    takeOverConfirm:
      'Its owner suspended it. Suspending it here as well makes the suspension yours: from then on only an administrator can lift it.',
    owner: 'Owner',
    noOwner: 'None: it acts on its own seats, set by course managers',
    ownerUnnamed: 'someone',
    ownerFixed: 'Given when it was registered, and never changed: nobody gives an agent another owner.',
    noOwnerFixed: 'Registered without one, so it stays nobody’s: an owner is given only when an agent is registered.',
    hostingFixed: {
      runtime:
        'Chosen when it was registered, and never changed: the site’s agent runtime alone is issued its token, and nobody is issued one here.',
      mcp: 'Chosen when it was registered, and never changed: its tokens are issued here, for whatever reaches it over MCP.',
    },
    ownedAgents: 'Agents they own',
    ownedAll: 'See all',
    ownedHint:
      'Owned by {owner}: it acts only as their delegate, seated by them in their courses, and never holds more than their seat there.',
    cannot: {
      self: 'This is your own account: you cannot suspend it.',
      role: 'Only root acts on someone who holds a platform role.',
      system:
        'The system account runs background jobs. It is never suspended, issued a token or linked to an identity.',
    },
  },

  owner: {
    placeholder: 'Search people by name or email, or paste an ID',
    placeholderId: 'Paste a person’s actor ID',
    noMatch: 'No active person matches.',
    pasteId: 'Paste the whole actor ID.',
    noSearch: 'This Core cannot search by name or email yet (it needs updating): paste the actor ID instead.',
    blocked: {
      notHuman: 'Not a person',
      suspended: 'Suspended',
      role: 'Only root can choose a holder of a platform role',
    },
  },

  token: {
    title: 'API token',
    intro:
      'Issue a token so they can call Core: this is how an agent gets its first credential, since it cannot sign in to ask for one. The token is shown once; Core keeps only its hash.',
    label: 'Label',
    labelPlaceholder: 'grader for CS101, autumn term',
    labelHint: 'What the token is for, so it can be recognised later.',
    expiry: 'Expires',
    days: '{n} days',
    never: 'Never',
    custom: 'Other…',
    customDays: 'Days',
    daysPlaceholder: '1–3650',
    daysInvalid: 'From 1 to 3650 days',
    submit: 'Issue token',
    suspendedNote: 'They are suspended: a token issued now is refused until they are reactivated.',
    runtimeAgent:
      'None is issued here: this agent is hosted on AIshie, and the site’s agent runtime alone is issued its one token, by the agent’s ID, when it hosts it. Revoking that token below stops people asking it on the site until the runtime is issued another.',
    revealTitle: 'Copy the token now',
    once: 'This is the only time the token is shown. Core keeps only its hash: if it is lost, issue a new one.',
    replayed:
      'This repeated an earlier request, so the token is not shown again. If it was not copied, issue a new one.',
    token: 'Token',
    prefix: 'Prefix',
    credential: 'Credential ID',
    expires: 'Expires',
    noExpiry: 'Does not expire',
    mcpTitle: 'Connecting over MCP',
    mcpEndpoint: 'Endpoint (streamable HTTP)',
    mcpHeader: 'Header',
    mcpNotes:
      'Tool names are the catalogue\'s with the dot turned into an underscore (grade_submit). A result whose status is "proposed" is not an error: the action waits for a person, and the agent learns the decision from event_list.',
    uncopiedTitle: 'Close without copying?',
    uncopied: 'The token has not been copied, and it will not be shown again.',
    closeAnyway: 'Close anyway',
    doneCopying: 'Done',
  },

  credentials: {
    title: 'Tokens and sign-ins',
    introAgent:
      'The API tokens this agent calls Core with. Revoking one stops that token from its next call without suspending the agent: its other tokens and its seats are kept.',
    introHuman:
      'Every way into this account: browser sessions, a password, single sign-on and an invitation link. Revoke one without suspending them: their other credentials and their seats are kept.',
    // Above the API tokens a person still holds: only agents are given them.
    personTokens: 'API tokens are for agents only: revoke these.',
    self: 'These are your own. Revoke them on your Account page, which can tell which session is the one you are using now.',
    selfLink: 'Open my account',
    showInactive: 'Show revoked and expired ({n})',
    tokens: 'API tokens',
    signIns: 'Sessions and other sign-ins',
    noTokens: 'No API tokens.',
    noLiveTokens: 'No live API tokens.',
    noSignIns: 'No live sessions or sign-ins.',
    col: {
      label: 'Label',
      token: 'Token',
      issuedBy: 'Issued by',
      created: 'Created',
      expires: 'Expires',
      lastUsed: 'Last used',
    },
    unlabelled: 'No label',
    selfIssued: 'Self-issued',
    issuedToRuntime: 'The site’s agent runtime',
    issuerUnknown: 'Not recorded',
    neverUsed: 'Never used',
    revokedAt: 'Revoked',
    state: {
      active: 'Active',
      revoked: 'Revoked',
      expired: 'Expired',
    },
    sessionVia: {
      password: 'Signed in with a password',
      sso: 'Signed in through {provider}',
      invite: 'Signed in by accepting an invitation',
    },
    subject: 'Account',
    linkedBy: 'Linked by',
    invitedBy: 'Invited by',
    // A password someone else set (member.reset_password).
    temporary: 'Temporary',
    setBy: 'Set by',
    temporaryHint: 'They must choose their own at their next sign-in.',
    note: 'Note',
    revoke: 'Revoke',
    revoked: 'Revoked',
    signedOut: 'Signed out',
    missing:
      'This Core cannot list an actor’s tokens and sign-ins yet (it needs updating). Until it is, a leaked token can be stopped only by suspending them.',
    confirm: {
      titleToken: 'Revoke the token “{label}”?',
      titleSession: 'Sign out this browser session?',
      title: 'Revoke this credential?',
      api_token: 'Anything using {token} is refused from its next call.',
      irreversible:
        'This cannot be undone: a revoked token never works again. If {name} still needs one, issue a new token.',
      keeps: 'Nothing else changes: {name} keeps their other tokens and sign-ins, and their seats.',
      session: 'The browser signed in with this session is signed out on its next request. {name} can sign in again.',
      password:
        '{name} can no longer sign in with a password until they set a new one, on their Account page while still signed in or through an invitation link.',
      sso: '{name} can no longer sign in through {provider}, until the identity is linked to them again.',
      invite: 'The invitation link stops working. A new one can be made at any time.',
      other: 'It stops working from its next use.',
    },
  },

  edit: {
    title: 'Edit registration',
    intro: 'Correct their name, or give them an email to sign in with. The kind and the platform role do not change.',
    introName: 'Correct its name. The kind and the platform role do not change.',
    displayName: 'Display name',
    email: 'Email',
    emailHint: 'What they sign in with. It can be changed, not removed. An email belongs to one person only.',
    emailChanged: 'From now on they sign in with the new email. Their password, if they have one, stays as it is.',
    withdrawsInvite:
      'Changing the email withdraws the invitation link waiting, which went to the old one: create a new one afterwards.',
    nothingChanged: 'Nothing was changed.',
    saved: 'Saved',
    blocked: {
      system: 'The system account runs background jobs: its registration does not change.',
    },
  },

  invite: {
    title: 'Invitation link',
    intro:
      'A link for them to choose a password with: opening it, they choose one and are signed in. It works once, and making another replaces it.',
    pending: 'A link made earlier works until {date}. Making a new one replaces it.',
    expired: 'The last link expired unused on {date}.',
    hasPassword:
      'They have a password already. Taking up a link replaces it: this is how a forgotten password is reset.',
    days: 'The link works for',
    dayOption: '{n} day | {n} days',
    submit: {
      first: 'Create invitation link',
      renew: 'Create a new link',
      reset: 'Create a link to reset their password',
    },
    blocked: {
      self: 'This is your own account: set your password on your Account page.',
      selfLink: 'Open my account',
      system: 'The system account never signs in.',
      agent: 'Agents connect with API tokens, not passwords: issue it a token instead.',
      suspended: 'They are suspended. Reactivate them to invite them.',
      noEmail:
        'They have neither a student/staff number nor an email, which is what they would sign in with. Give them one first.',
      giveEmail: 'Give them a number or an email',
    },
    revealTitle: 'Copy the invitation link now',
    once: 'This is the only time the link is shown. If it is lost, create a new one: that replaces this one.',
    replayed:
      'This repeated an earlier request, so the link is not shown again. If it was not copied, create a new one.',
    link: 'Invitation link',
    email: 'They sign in with',
    expires: 'Works until',
    send: 'Send it to them yourself, in a way you trust: whoever opens it chooses the password. It works once.',
    uncopied: 'The link has not been copied, and it will not be shown again.',
  },

  sso: {
    title: 'Single sign-on',
    intro:
      "Link this person's account at the identity provider so they can sign in with it. Signing in creates nobody: until this is done, someone the provider vouches for is still nobody here.",
    provider: 'Provider',
    providerHint: "This installation's name for the identity provider.",
    providerNotOffered: 'not offered now',
    subject: 'Account (UPN)',
    subjectPlaceholder: "name{'@'}example.edu",
    subjectHint: 'For ADFS, the user principal name. Letter case does not matter.',
    subjectOf: 'Account ({claim})',
    subjectOfHint: "What {name} gives as its {claim} claim for this person. Letter case does not matter where it holds an {'@'}.",
    useEmail: 'Use their email',
    submit: 'Link identity',
    done: 'Identity linked',
    linkedAs: 'Linked {subject}',
    once: 'One identity links to one person, for good: once linked it is never reassigned to anyone else.',
    agent: 'Agents connect with API tokens, not single sign-on.',
  },
  // A person's login ID: the student or staff number they sign in with, as with an email.
  loginId: {
    label: 'Student/staff number',
    registerHint:
      'What they sign in with, as with an email: their student or staff number. Give it, an email or both. It can be given or changed later, not removed, and belongs to one person only.',
    editHint: 'What they sign in with, as with an email. It can be changed, not removed; setting it vouches for it.',
    unverified: 'Unverified',
    unverifiedHint:
      'They typed it themselves, registering through an invite link, and nobody has checked it. Setting it on their page vouches for it.',
    vouch: 'I have checked it: save it as confirmed',
    problem: {
      empty: 'Required',
      long: 'At most {n} characters',
      email: 'A student or staff number has no @: an email goes in its own field',
      chars: 'Only letters, digits, dots, hyphens and underscores, with no spaces',
    },
    // Core's refusals, by the reason it names.
    refusal: {
      login_id_taken: 'Someone is already registered with that student or staff number.',
    },
  },
}
