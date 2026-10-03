// My agents (/account/agents): the agents a person owns, their tokens and seats.
export default {
  title: 'My agents',
  subtitle: 'Agents you own: connect them, and bring them into your courses to work for you',
  notHuman: 'Only a person owns agents. An agent signed in here has no agents of its own.',

  // The link from the Account page.
  accountCard: {
    title: 'My agents',
    body: 'Agents you own, AI or other programs, that work in your courses as your delegates.',
    open: 'Manage my agents',
  },

  about: {
    title: 'How agents work',
    here: {
      title: 'Registered here',
      body: 'An agent is an identity in AIshie: a name, how it runs and the courses it is in. No model, prompt or key is kept with it.',
    },
    runtime: {
      title: 'One of two ways, for good',
      body: 'Hosted on AIshie: AIshie runs it with a model you choose, and people in its courses ask it on the site. Or MCP access: your own tools use it with its tokens. You choose when you create it.',
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
    empty: 'You have no agents yet. Create one: hosted on AIshie, or used from your own tools over MCP.',
    emptyNoSelfService: 'You have no agents. Here an administrator registers them: ask yours for one.',
    seats: 'Not in any course | In one course | In {n} courses',
    requests: 'One request waiting | {n} requests waiting',
    created: 'Created',
  },

  limit: {
    noSelfService:
      'Here only an administrator registers agents: ask yours for one. Once it is yours, you give it tokens and bring it into your courses on this page.',
    reached:
      'You have {limit} agents that are not suspended, the most you may have. Suspend one you no longer use to make another.',
  },

  create: {
    title: 'New agent',
    intro:
      'Give it a name, and choose how it runs. No model, prompt or key is kept with it here: only who it is, how it runs and the courses you bring it into.',
    name: 'Name',
    namePlaceholder: 'e.g. Revision agent',
    nameHint: 'What it is called wherever it appears: member lists, conversations, approvals. It can be changed later.',
    nameRequired: 'A name is required',
    next: {
      runtime: 'Next, host it on AIshie, and choose the model it answers with. You never handle a token.',
      mcp: 'Next, give it a token, and connect your own tool to AIshie with it.',
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

  // Whether people can ask it on the site (agent.get's site_chat), as its hosting decides.
  siteChat: {
    title: 'Questions on the site',
    on: 'People in its courses can ask it on the site: AIshie’s agent service runs it now.',
    off: 'Nobody can ask it on the site just now: AIshie’s agent service is not running it. Host it, or resume it, on this page.',
    suspended: 'Nobody can ask it on the site while it is suspended.',
    mcp: 'Nobody can ask it on the site: it has MCP access, and is used from your own tools. An agent people ask here is one created as hosted on AIshie.',
    stop: 'To stop people asking it, pause its hosting, or suspend it.',
  },

  detail: {
    title: 'Agent',
    subtitle: 'How it runs, and the courses it works in',
    notFound: 'You have no agent with this ID.',
    about: 'About',
    presence: 'Connection',
    created: 'Created',
    id: 'Actor ID',
    delegateNote: 'In each course it acts as your delegate: never with more than your own seat.',
    tokenNote: 'Whoever holds one of its tokens acts as this agent, and so as your delegate.',
    hostingFixed: 'Chosen when it was created, and never changed.',
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

  // Connecting one's own tool to an agent with MCP access (McpAccessCard, ConnectToolSteps).
  connect: {
    tokenTodo: 'It has no token yet: your tool connects with one.',
    tokenDone: 'It has a token that works.',
    waiting: 'None of its tokens has been used yet.',
    waitingWatching: 'Waiting for your tool to connect… this page checks every few seconds.',
    toolIntro:
      'Claude Desktop, an editor, an agent SDK or any other MCP client can be this agent: give it this address, and one of the agent’s tokens in this header.',
    endpoint: 'MCP endpoint (streamable HTTP)',
    header: 'Header',
    headerHint:
      'Put one of the agent’s tokens in place of {placeholder}. Keep it secret: whoever has it acts as this agent.',
    claudeDesktop: 'Example: Claude Desktop',
    claudeDesktopFile: 'claude_desktop_config.json',
    claudeDesktopHint:
      'Add this to Claude Desktop’s configuration (Settings → Developer → Edit Config), put one of the agent’s tokens in place of {placeholder}, and restart Claude Desktop. It runs mcp-remote with npx, so Node.js must be installed.',
    claudeDesktopHintToken:
      'Add this to Claude Desktop’s configuration (Settings → Developer → Edit Config), and restart Claude Desktop. It holds the token: keep the file to yourself. It runs mcp-remote with npx, so Node.js must be installed.',
    courseTodo: 'It can do nothing until it is in a course: bring it into one where you are seated.',
    courseWaiting: 'A request to seat it waits for an instructor’s approval.',
    courseDone: 'In one course. | In {n} courses.',
  },

  // How an agent with MCP access runs, on its page (McpAccessCard).
  mcp: {
    title: 'How it runs',
    notOnSite: 'People cannot ask this agent on the site',
    notOnSiteBody:
      'It has MCP access: your own tools (Claude Desktop, an editor, a script) use it over MCP with one of its tokens, and act as it in its courses, as your delegate.',
  },

  copy: {
    done: 'Copied to the clipboard',
    failed: 'It could not be copied automatically. Select it and copy it yourself.',
  },

  tokens: {
    title: 'Tokens',
    new: 'New token',
    intro:
      'What your tools connect with. Revoking one stops whatever uses it from its next call; the agent and its other tokens carry on.',
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
    revokeBody: 'Whatever uses {token} is refused from its next call as {name}.',
    revokeKeeps: 'The agent keeps its seats and its other tokens. A revoked token never works again.',
    revoked: 'Token revoked',
  },

  issue: {
    title: 'New token for {name}',
    intro:
      'For one tool of yours that uses {name} over MCP. Whoever holds it acts as this agent, as your delegate: never with more than your own seat.',
    suspended: 'The agent is suspended: the token is refused until the agent is reactivated.',
    label: 'Label',
    labelPlaceholder: 'e.g. Claude Desktop on my laptop',
    labelHint: 'Where it is used, so that you can tell it apart later.',
    labelRequired: 'A label is required',
    expiry: 'Expires',
    after: 'After a number of days',
    never: 'Never',
    days: 'days',
    daysInvalid: 'Enter a whole number of days from 1 to 3650',
    noExpiryWarn:
      'A token that never expires works until it is revoked. Prefer an expiry for a tool you do not watch.',
    submit: 'Create token',
  },

  reveal: {
    title: 'The new token for {name}',
    warning: 'Copy it now. It is not stored anywhere, and it will not be shown again.',
    token: 'Token',
    listedAs: 'In the list it appears as',
    connect: 'Connect your tool',
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
    proposals: 'Its proposals here',
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
        'Your personal agent: it reads what you can read (your own work and grades, if you are a student) and answers only you.',
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
    adjust: 'All permissions, and naming other levels',
    adjustHelp:
      'Leave a permission empty for what it gets anyway. Levels it may not hold here are greyed out, each saying why; for a student, what goes beyond a personal agent — drafting your submission, say — it does only by proposal, which you then confirm.',
    changed: '{n} set differently',
    submit: 'Bring it in',
    submitRequest: 'Send the request',
    done: '{name} is in {course}',
  },
}
