// The chat with the courses' agents: the panel beside every page, and a conversation in it.
export default {
  panel: {
    title: 'Chat',
    toggle: 'Chat with agents',
    toggleUnread: 'Chat with agents: {n} unread',
    toggleTip: 'Chat with agents ({key})',
    course: 'Course',
    new: 'New chat',
    newTip: 'New conversation',
    history: 'History',
    close: 'Close the chat',
    resize: 'Resize the chat panel',
    backToHistory: 'Back to the history',
    backToAgents: 'Back to the agents',
    pickTitle: 'Ask an agent',
    pickHint: 'The agents you can ask in {course}: the course’s own, and your personal assistant.',
    noCourses: 'None of your courses lets you ask agents questions.',
  },
  history: {
    title: 'Your conversations',
    scope: 'Which courses',
    thisCourse: 'This course',
    allCourses: 'All courses',
    empty: 'You have not asked an agent anything in this course yet.',
    emptyAll: 'You have not asked an agent anything yet.',
    untitled: 'Untitled',
    unread: 'New answer',
    moreFailed: 'Could not load more of them. Try again.',
    // Searching the history (title and agent), and its groups by last activity.
    search: 'Search titles and agents',
    noMatch: 'No conversation matches “{q}”.',
    searchLoaded: 'Only the conversations loaded are searched: load more to search them too.',
    groups: {
      today: 'Today',
      yesterday: 'Yesterday',
      week: 'This week',
      earlier: 'Earlier',
    },
  },
  respondents: {
    empty: 'No agent here answers your questions yet.',
    offlineHint: 'Nothing seems to be running this agent now: an answer may take a while.',
    sharedHint: 'It answers other members too, holds what each one writes, and may repeat it to them.',
    agentPage: 'Go to its page',
  },
  between: '{opener} → {respondent}',
  messagesLabel: 'Messages',
  older: 'Earlier messages',
  olderFailed: 'Could not load them. Try again.',
  empty: {
    opener: 'Nothing has been written yet. Ask {name} your question below.',
    other: 'Nothing has been written yet.',
  },
  // The line in the messages while an answer is awaited: the agent at work, and for how long.
  status: {
    thinking: 'Thinking…',
    seconds: '{s}s',
    minutes: '{m}m {s}s',
  },
  typing: 'Waiting for {name}…',
  held: 'Waiting for approval: it appears here once someone approves it.',
  myActions: 'My actions',
  trouble: 'Having trouble reaching the server; still trying…',
  new: {
    intro: 'Start a conversation with {name}. Your first message opens it.',
    yourAgent: 'This is your own agent: it acts for you, and never with more than your seat.',
  },
  proposed: {
    title: 'Waiting for approval',
    body: 'Your conversation with {name} starts once someone approves it. You can follow it in My actions.',
  },
  // What the line above the composer says.
  state: {
    waitingApproval: 'Each answer waits for someone’s approval before you see it.',
    answerPending: 'An answer is waiting for approval.',
    withdrawn: 'You withdrew your question: {name} will not answer it.',
    start: 'Ask {name} anything about the course.',
    overseeing: 'You are reading this as course staff.',
    readOnly: 'Agents answer questions in the chat now: you can read this conversation.',
  },
  // Why an answer may not come.
  availability: {
    gone: '{name} is no longer in the course. Start a new conversation with someone else.',
    paused: '{name} is paused in this course and cannot answer now.',
    notAnswering: '{name} is not answering questions now.',
  },
  blocked: {
    archived: 'This course is archived: nothing more can be written.',
  },
  closed: {
    title: 'This conversation is closed.',
    said: 'They said: “{reason}”',
    startNew: 'Start a new conversation',
  },
  composer: {
    label: 'Your message',
    askPlaceholder: 'Ask {name}…',
    send: 'Send',
    sendTip: 'Send (Enter) · Shift+Enter for a new line',
    stop: 'Stop',
    stopTip: 'Stop: withdraw the question, back into the box',
    // The list a slash opens (commands), and what the empty box hints at.
    commands: 'Commands',
    hintCommands: '/ for commands',
    hintMentions: "{'@'} to cite an assignment or material",
    count: '{n} / {max} characters',
  },
  // What a slash at the start of the box offers.
  commands: {
    new: 'New conversation',
    history: 'Conversation history',
    close: 'End this conversation',
  },
  // What an @ offers: the course's assignments and materials, whose title it writes in, quoted.
  mention: {
    label: 'Assignments and materials',
    insert: '“{title}” ',
    loading: 'Loading assignments and materials…',
    none: 'No assignment or material has “{q}” in its title.',
    empty: 'This course has no assignments or materials you can see yet.',
    kind: {
      assignment: 'Assignment',
      material: 'Material',
    },
  },
  // A new conversation's first words, offered to start with; a click puts them in the box.
  suggestions: {
    title: 'Try asking',
    explainAssignment: 'Explain what this assignment asks for',
    checkReasoning: 'Check my reasoning',
    summarizeWeek: 'Summarise this week’s materials',
    practice: 'Give me a few practice questions',
  },
  conflict: {
    closed: 'This conversation is closed, so nothing more can be written in it.',
  },
  // Who can read a conversation (Core's visible_to).
  visibleTo: {
    button: 'Who can read this',
    title: 'Who can read this conversation',
    participants: 'The two taking part',
    overseers: 'Course staff who decide actions for the one who started it',
    actionRecord: 'Anyone who decides actions in this course, in the record of each message',
    respondentAnswersOthers:
      'The one answering here answers other members too: it holds what each of them writes, and may repeat to them what is written here',
    sharedNote: 'It answers other members too: what you write here it may repeat to them.',
    note: 'Every message is written through an action, and the record of it keeps the text, even after it is withdrawn.',
  },
  message: {
    retract: 'Withdraw',
    // Under a message, on hover: copy it (as Markdown), and take the question awaiting its answer back to edit it.
    copy: 'Copy message',
    edit: 'Edit',
    editTip: 'Withdraw this question and put it back in the box, to change and send again',
    retractedByYou: 'You withdrew this message.',
    retractedBy: '{name} withdrew this message.',
    retractedByStaff: 'Course staff withdrew this message.',
    reason: 'Reason: {reason}',
  },
  reasonPlaceholder: 'Reason (optional)',
  reasonTooLong: 'At most {max} characters',
  // The ⋯ menu in a conversation's header: who can read it, how its answers arrive, closing it.
  menu: {
    label: 'Conversation options',
  },
  close: {
    title: 'Close this conversation?',
    bodyOpener:
      'Nothing more can be written in it; it stays readable. Anything you give as a reason is shown to the other participant.',
    confirm: 'Close conversation',
    done: 'Conversation closed',
  },
  // A question awaiting its answer, taken back to the composer: to edit it, or to stop waiting.
  edit: {
    done: 'Your question was withdrawn and put back in the box: change it and send it again. {name} does not answer a withdrawn question, though an answer it had already begun may still arrive.',
  },
  stop: {
    done: 'Stopped: your question was withdrawn and put back in the box. {name} does not answer a withdrawn question, though an answer it had already begun may still arrive.',
  },
  retract: {
    title: 'Withdraw this message?',
    bodyMine: 'Its text will no longer be shown here. The record of the action that wrote it keeps the text.',
    bodyStaff:
      'The message from {name} will no longer be shown here. The record of the action that wrote it keeps the text.',
    confirm: 'Withdraw',
    done: 'Message withdrawn',
  },
}
