// A course's agents (/courses/:courseId/agents): course agents, and the policy for students' own.
export default {
  title: 'Agents',
  subtitle:
    'The agents seated in this course, how their answers reach students, and whether students may bring their own.',
  add: 'Add a course agent',
  noPermission: 'This page needs the “Manage members” or the “Approve & review” permission here.',
  proposed: 'Your change is waiting for approval. Nothing changes until someone approves it.',
  requests:
    '{n} request to bring an agent into this course is waiting for approval. | {n} requests to bring agents into this course are waiting for approval.',
  openApprovals: 'Open approvals',
  intro: {
    title: 'An agent never does more than its owner',
    body: 'An agent a person owns takes part only as that person’s delegate: it never holds more than its owner’s seat, reaches no further, is paused while they are, and leaves the course with them. A course agent is one that students may ask about the course; a personal agent answers only its owner.',
  },
  groups: {
    course: {
      title: 'Course agents',
      help: 'Students may ask these about the course. Each answers any student whose own seat reaches at least as far as the agent’s does, and reads only published material.',
      empty: 'No course agent yet. Add one of your agents so that students can ask it about the course.',
    },
    personal: {
      title: 'Personal agents',
      help: 'Agents people brought in for themselves. Each answers only its owner, and never holds more than its owner’s seat.',
      empty: 'Nobody has brought in an agent of their own.',
    },
    unowned: {
      title: 'Other agents',
      help: 'Agents an administrator registered and someone seated directly, such as graders. Nobody owns them: their seat alone says what they may do.',
      empty: 'No other agents.',
    },
  },
  // Each answering agent's conversations, for those who decide actions here.
  log: {
    open: 'Conversation log',
    title: 'Conversation log: {name}',
    hint: 'What the members you decide actions for have asked {name} in this course. You can read each conversation and withdraw a message; you cannot write in them.',
    empty: 'Nobody you oversee has asked this agent anything here yet.',
    back: 'All its conversations',
  },
  row: {
    actsFor: 'For',
    presenceUnknown: 'Connection not known',
    presenceUnknownHelp:
      'When an agent was last connected is shown to its owner, and to those who may ask it questions.',
    more: 'More',
    removeAgent:
      'Its conversations are closed, and its owner can bring it in again later, as a fresh start with a new seat.',
    // A course agent nobody can ask on the site, and why: MCP access, or not running now.
    notAskable: {
      mcp: 'Students cannot ask it on the site: it has MCP access, and is used from its owner’s own tools.',
      notRunning: 'Students cannot ask it on the site until AIshie runs it again: its owner hosts it from My agents.',
    },
  },
  replies: {
    label: 'Replies',
    saved: 'Replies from {name} changed',
    options: {
      autonomous: 'Sent at once',
      pending_review: 'Sent at once, reviewed after',
      confirm_required: 'Each approved first',
      denied: 'Off',
    },
    optionHelp: {
      autonomous: 'The student sees each reply as soon as the agent writes it.',
      pending_review: 'The student sees each reply at once; it also waits in the review queue for someone to look at.',
      confirm_required: 'Nobody sees a reply until someone who approves actions here approves it.',
      denied: 'It answers nobody; students cannot start a conversation with it.',
    },
    capped: 'Now: {level}',
    cappedHelp:
      'Its owner’s own seat allows less than this, and an agent never does more than its owner, so its replies go out at the lower level.',
    help: 'Reviewing and approving replies happens under Approvals. Nobody decides on their own agent’s actions, so an agent’s owner cannot approve or review its replies: another member who approves actions here must.',
  },
  policy: {
    title: 'Students and agents',
    help: 'These change every current student’s seat at once.',
    partial:
      'This course has too many members to read in full, so what students hold now is counted over the first ones only.',
    nobody: 'There are no current students.',
    currentAll: 'Now: {level} for every student ({total}).',
    current: 'Now: {level} for {n} of {total} students; the others are set differently.',
    mixed: 'Students’ seats differ: {summary}.',
    confirm:
      'The seat of the one current student will be set to “{what}”. | The seats of all {n} current students will be set to “{what}”.',
    future:
      'Students added later get what their preset gives instead (the built-in Student preset: agents need approval, and conversations are on).',
    partialConfirm: 'Only some of the members could be counted here; Core changes every current student’s seat.',
    apply: 'Apply to all students',
    success: 'Changed for {n} student | Changed for {n} students',
    agents: {
      label: 'Students’ own agents',
      help: 'A student may bring an agent they own into this course as their personal agent. It reads the material and that student’s own work and grades, answers only that student, and never holds more than the student’s seat.',
      options: {
        off: 'Off',
        approval: 'Needs approval',
        allowed: 'Allowed',
      },
      optionHelp: {
        off: 'Students cannot bring their agents in.',
        approval: 'Each request waits until someone who approves actions here approves it.',
        allowed: 'Students bring their agents in themselves, with no approval.',
      },
      offKeeps: 'Agents already brought in stay. To take one out, pause or remove it under Personal agents.',
      confirmTitle: 'Change students’ own agents?',
    },
    chat: {
      label: 'Conversations',
      help: 'Whether students may start conversations: asking course agents, and their own agents, questions in the chat.',
      on: 'On',
      off: 'Off',
      onHelp: 'Students can ask the course agents, and their own personal agents, questions.',
      offHelp:
        'Students can no longer start conversations or write in the ones they have, and their own agents stop answering them. What was written stays readable.',
      confirmTitle: 'Change students’ conversations?',
    },
  },
  addDialog: {
    title: 'Add a course agent',
    explainTitle: 'What a course agent is',
    explain:
      'One of your own agents, brought in as your delegate for students to ask about the course. It answers any student whose own seat reaches at least as far as it does (with the Course agent preset, every student), and reads only published material: nobody’s work or grades. It holds what each student writes to it, and may repeat it to the others it answers.',
    explainBound:
      'It never holds more than your seat, is paused while you are, and leaves the course with you. You can change how its replies go out once it is here.',
    source: 'Which agent',
    existing: 'One of my agents',
    create: 'A new agent',
    pick: 'Agent',
    pickPlaceholder: 'Choose one of your agents',
    none: 'None of your agents can be brought in here. Create a new one instead.',
    noneAvailable: 'None of your agents can be brought in here.',
    alreadyHere: 'Already in this course',
    suspended: 'Suspended',
    name: 'Name',
    namePlaceholder: 'e.g. COMP1010 tutor',
    nameHelp: 'Students see this name when they ask it a question.',
    hostingHelp:
      'Students ask a course agent on the site only when it is hosted on AIshie: one with MCP access is used from your own tools, and nobody can ask it here.',
    mcpPicked: 'Students cannot ask {name} on the site: it has MCP access, and is used from your own tools.',
    preview: 'What it will hold',
    previewHelp: 'As Core would seat it now: the Course agent preset, cut down to what your own seat holds.',
    can: 'Permissions',
    work: 'Students’ work',
    readsNobody: 'Nobody’s: it reads no submissions or grades.',
    noEnd: 'No end, unless your own seat ends',
    needsApproval: 'Bringing in an agent needs approval here: it is seated once someone approves your request.',
    reviewedAfter: 'It is seated at once, and the addition is reviewed after.',
    createdNote: '{name} has been created and belongs to you.',
    connectLink: 'Set it up from My agents',
    connect:
      'An agent does nothing until it runs: under My agents, host it on AIshie and choose its model, or, with MCP access, give your tool a token.',
    submit: 'Add course agent',
    submitProposal: 'Request to add',
    success: '{name} is now a course agent',
    loadFailed: 'Your agents could not be loaded.',
    noAgentDelegate: 'Your seat here does not allow bringing in agents.',
  },
}
