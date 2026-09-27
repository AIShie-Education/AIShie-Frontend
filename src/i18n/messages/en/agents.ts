// My agents (/account/agents): the agents a person owns, their tokens and seats.
export default {
  title: 'My agents',
  subtitle: 'Agents you own: connect them, and bring them into your courses to work for you',
  notHuman: 'Only a person owns agents. An agent signed in here has no agents of its own.',

  // The link from the Account page.
  accountCard: {
    title: 'My agents',
    body: 'AI assistants and other programs you own, that work in your courses as your delegates.',
    open: 'Manage my agents',
  },

  about: {
    title: 'How agents work',
    here: {
      title: 'Registered here',
      body: 'An agent is an identity in AIShiteru: a name, its tokens and the courses it is in. No model, prompt or key is kept here.',
    },
    runtime: {
      title: 'Runs elsewhere',
      body: 'What thinks and answers is a runtime: a program on your computer or a service you use. It connects with one of the agent’s tokens, and asks AIShiteru for work.',
    },
    delegate: {
      title: 'Acts only for you',
      body: 'In a course, your agent is your delegate: it never does more than your own seat allows, reaches no further, and leaves when you do.',
    },
  },

  standing: {
    active: 'Active',
    suspendedByMe: 'Suspended by you',
    suspendedByAdmin: 'Suspended by an administrator',
  },

  list: {
    title: 'Your agents',
    new: 'New agent',
    count: 'None active | One active | {n} active',
    countOf: '{n} of {limit} active',
    suspendedDoNotCount: 'Suspended agents do not count towards how many you may have.',
    empty: 'You have no agents yet. Create one, give it a token, and connect a runtime to it.',
    seats: 'Not in any course | In one course | In {n} courses',
    requests: 'One request waiting | {n} requests waiting',
    created: 'Created',
  },

  limit: {
    reached:
      'You have {limit} agents that are not suspended, the most you may have. Suspend one you no longer use to make another.',
  },

  create: {
    title: 'New agent',
    intro:
      'Give it a name. Everything about how it runs stays with whatever runs it: here it is only who it is, its tokens and the courses you bring it into.',
    name: 'Name',
    namePlaceholder: 'e.g. Study helper',
    nameHint: 'What it is called wherever it appears: member lists, conversations, approvals. It can be changed later.',
    nameRequired: 'A name is required',
    next: {
      token: 'Next, give it a token.',
      runtime: 'Start a runtime with that token, so the agent can connect.',
      course: 'Bring it into a course where you are seated.',
    },
    submit: 'Create agent',
    done: '{name} is created',
  },

  rename: {
    title: 'Rename agent',
    hint: 'The new name shows everywhere the agent appears, its history included.',
    done: 'Renamed',
  },

  detail: {
    title: 'Agent',
    subtitle: 'Its runtime, its tokens and the courses it works in',
    notFound: 'You have no agent with this ID.',
    about: 'About',
    presence: 'Connection',
    created: 'Created',
    id: 'Actor ID',
    delegateNote:
      'Whoever holds one of its tokens acts as this agent, and so as your delegate: never with more than your own seat in each course.',
    rename: 'Rename',
    suspend: 'Suspend',
    reactivate: 'Reactivate',
    suspendTitle: 'Suspend {name}?',
    suspendBody:
      'Every call it makes is refused from now on, in every course, until you reactivate it. Its seats, tokens and history are kept. A suspended agent does not count towards how many you may have.',
    suspended: '{name} is suspended',
    reactivated: '{name} is active again',
    suspendedByMe: 'You suspended this agent: every call it makes is refused. Reactivate it to let it work again.',
    suspendedByAdmin: 'An administrator suspended this agent',
    suspendedByAdminBody:
      'Every call it makes is refused, and only an administrator can lift the suspension. Ask your platform administrator if you think it should be lifted.',
    adminOnly: 'An administrator suspended it, and only an administrator can lift that.',
  },

  connect: {
    title: 'Connect a runtime',
    intro:
      'This agent is only registered here. To work, it needs a runtime: a program that calls a language model, and connects to AIShiteru over MCP with one of the agent’s tokens.',
    step: {
      token: 'Give it a token',
      runtime: 'Start the runtime with the token',
      course: 'Bring it into a course',
    },
    tokenTodo: 'The runtime proves it is this agent with a token. It is shown once, when it is made.',
    tokenDone: 'It has a token that works.',
    runtimeTodo: 'Once it has a token, set these in the runtime’s environment and start it.',
    waiting: 'None of its tokens has been used yet. Start the runtime with the token.',
    waitingWatching: 'Waiting for the runtime to connect… this page checks every few seconds.',
    endpoint: 'MCP endpoint (streamable HTTP)',
    env: 'Environment for the runtime',
    envHint: 'Put the token itself in place of the placeholder. Keep it secret: whoever has it acts as this agent.',
    tokenPlaceholder: '<the agent’s token>',
    showSettings: 'Show the connection settings',
    courseTodo: 'It can do nothing until it is in a course: bring it into one where you are seated.',
    courseWaiting: 'A request to seat it waits for an instructor’s approval.',
    courseDone: 'In one course. | In {n} courses.',
  },

  copy: {
    done: 'Copied to the clipboard',
    failed: 'It could not be copied automatically. Select it and copy it yourself.',
  },

  tokens: {
    title: 'Tokens',
    new: 'New token',
    intro:
      'What its runtimes connect with. Revoking one stops that runtime from its next call; the agent and its other tokens carry on.',
    showInactive: 'Show revoked and expired ({n})',
    empty: 'No tokens yet.',
    unlabelled: 'No label',
    lastUsed: 'Last used',
    neverUsed: 'Never used',
    created: 'Created',
    expires: 'Expires',
    noExpiry: 'Does not expire',
    issuedBy: 'Issued by',
    someoneElse: 'An administrator',
    revokedAt: 'Revoked',
    state: {
      active: 'Active',
      revoked: 'Revoked',
      expired: 'Expired',
    },
    revoke: 'Revoke',
    revokeTitle: 'Revoke this token?',
    revokeBody: 'A runtime using {token} is refused from its next call as {name}.',
    revokeKeeps: 'The agent keeps its seats and its other tokens. A revoked token never works again.',
    revoked: 'Token revoked',
  },

  issue: {
    title: 'New token for {name}',
    intro:
      'For one runtime of {name}. Whoever holds it acts as this agent, as your delegate: never with more than your own seat.',
    suspended: 'The agent is suspended: the token is refused until the agent is reactivated.',
    label: 'Label',
    labelPlaceholder: 'e.g. runtime on my laptop',
    labelHint: 'Where it runs, so that you can tell it apart later.',
    labelRequired: 'A label is required',
    expiry: 'Expires',
    after: 'After a number of days',
    never: 'Never',
    days: 'days',
    daysInvalid: 'Enter a whole number of days from 1 to 3650',
    noExpiryWarn:
      'A token that never expires works until it is revoked. Prefer an expiry for a runtime you do not watch.',
    submit: 'Create token',
  },

  reveal: {
    title: 'The new token for {name}',
    warning: 'Copy it now. It is not stored anywhere, and it will not be shown again.',
    token: 'Token',
    env: 'Environment for the runtime',
    envHint: 'Give these to the runtime (as environment variables, or in its settings), and start it.',
    header: 'Or, for an MCP client that takes a header',
    listedAs: 'In the list it appears as',
    done: 'I have copied it',
    closeUncopiedTitle: 'Close without copying?',
    closeUncopied: 'The token will not be shown again. If you lose it, revoke it and make a new one.',
    closeAnyway: 'Close anyway',
    missingTitle: 'The token cannot be shown',
    missing:
      'This token was made by an earlier try of the same request, and a token is shown only once. If you did not keep it, revoke it and make a new one.',
    revokeIt: 'Revoke it',
  },

  seats: {
    title: 'Courses',
    intro:
      'Where it is seated as your delegate, and what it may do there now: its own permissions, capped by your seat.',
    empty: 'It is not in any course yet.',
    students: 'Students',
    assignments: 'Assignments',
    ends: 'Seat ends',
    noEnd: 'Not set',
    mayNow: 'May now',
    nothing: 'Nothing',
    nothingNow: 'Nothing while its seat or yours is paused, or the course is archived',
    allPerms: 'All permissions',
    cappedHint: 'Each is the lower of the agent’s own level and yours.',
    withdraw: 'Take out',
    withdrawTitle: 'Take it out of {course}?',
    withdrawBody:
      '{name} loses its seat in {course}, and whatever it proposed that nobody has decided is cancelled. Everything it did stays on record. Bringing it back later gives it a new seat: a fresh start.',
    withdrawn: 'Taken out of {course}',
    withdrawnCancelled:
      'Taken out of {course}; one proposal of its was cancelled | Taken out of {course}; {n} proposals of its were cancelled',
    archived: 'An archived course takes no changes, this one included.',
  },

  requests: {
    title: 'Waiting for approval',
    intro: 'Requests to seat it that an instructor has not decided yet.',
    since: 'Requested',
    takeBack: 'Take back',
    takeBackTitle: 'Take back this request?',
    takeBackBody: 'The request to seat {name} in {course} is cancelled. You can make a new one later.',
    takenBack: 'The request for {course} is taken back',
  },

  bring: {
    open: 'Bring into a course',
    title: 'Bring {name} into a course',
    intro:
      'It joins as your delegate: it can never do more than you can there, nor reach further, nor stay after you leave.',
    course: 'Course',
    noCourses: 'You are not seated in any course.',
    noneAvailable: 'None of your courses takes this agent now; each says why.',
    needsApproval: 'An instructor approves it first',
    blocked: {
      archived: 'Archived: it takes no changes',
      paused: 'Your seat here is paused',
      delegate: 'You are seated here as someone’s delegate',
      noPerm: 'Your seat here does not let you bring agents in',
      seated: 'It is in this course already',
      requested: 'A request to seat it here is waiting',
    },
    purpose: 'What it is for',
    purposeCourse: 'Course agent for students',
    purposeHelp: {
      personal:
        'Your own assistant: it reads what you can read (your own work and grades, if you are a student) and answers only you.',
      course:
        'A course agent: every student may ask it about the course material, and it may repeat to one what another told it. It reads nobody’s work. Offered because you manage this course’s members.',
    },
    preview: 'What it would get',
    level: {
      autonomous: 'It is seated as soon as you bring it in.',
      pending_review: 'It is seated as soon as you bring it in, and an instructor reviews it afterwards.',
      confirm_required:
        'This sends a request: an instructor approves it before your agent is seated. You can take it back while it waits.',
      denied: 'Your seat here does not let you bring agents in.',
    },
    answers: 'Who may ask it',
    answersYou: 'Only you',
    answersCourse: 'You and the students: it holds what each one writes, and may repeat it to the others',
    students: 'Students it reaches',
    assignments: 'Assignments',
    ends: 'Seat ends',
    noEnd: 'Not set',
    may: 'May',
    reach: {
      students: {
        all: 'The whole class',
        nobody: 'Nobody’s work',
        you: 'Only you: your own work and grades',
        listed: 'One student | {n} students',
      },
      assignments: {
        all: 'All assignments',
        nobody: 'None',
        listed: 'One assignment | {n} assignments',
      },
    },
    cappedHint:
      'Clipped to your own seat. Someone who manages the course’s members can change its permissions later, never beyond yours.',
    submit: 'Bring it in',
    submitRequest: 'Send the request',
    done: '{name} is in {course}',
  },
}
