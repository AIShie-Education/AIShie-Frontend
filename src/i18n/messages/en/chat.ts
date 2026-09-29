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
    waiting: '{name} has your question.',
    waitingApproval: 'Each answer waits for someone’s approval before you see it.',
    answerPending: 'An answer is waiting for approval.',
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
    count: '{n} / {max} characters',
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
  retract: {
    title: 'Withdraw this message?',
    bodyMine: 'Its text will no longer be shown here. The record of the action that wrote it keeps the text.',
    bodyStaff:
      'The message from {name} will no longer be shown here. The record of the action that wrote it keeps the text.',
    confirm: 'Withdraw',
    done: 'Message withdrawn',
  },
}
