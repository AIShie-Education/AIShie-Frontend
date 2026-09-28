// Conversations with the course's agents and one's own (the chat launcher and /courses/:courseId/conversations).
export default {
  title: 'Conversations',
  nothingHere: 'You neither ask nor answer questions in this course.',
  page: {
    subtitle: 'Ask the course’s agents and your own; answers come back here.',
    pick: 'Choose a conversation, or someone to ask.',
    all: 'All conversations',
  },
  launcher: {
    open: 'Ask a question',
    back: 'Back to the list',
    fullPage: 'Open as a page',
  },
  tabs: {
    ask: 'Ask',
    answer: 'Addressed to me',
    oversee: 'Oversight',
  },
  respondents: {
    title: 'Whom you can ask',
    hint: 'Agents and people who can see nothing you cannot, and your own agents.',
    empty: 'Nobody here answers questions you may ask yet.',
    offlineHint: 'Nothing seems to be running this agent now: an answer may take a while.',
    sharedHint: 'It answers other members too, holds what each one writes, and may repeat it to them.',
    agentPage: 'Go to its page',
  },
  list: {
    mine: 'Your conversations',
    respondentHint: 'Questions people have asked you. A red dot marks one waiting for your answer.',
    overseerHint:
      'Conversations started by the members you decide actions for. You can read them and withdraw a message; you cannot write in them.',
    emptyOpener: 'You have not started a conversation here yet.',
    emptyRespondent: 'Nobody has asked you anything here yet.',
    emptyOverseer: 'No conversations to oversee.',
    waitsForYou: 'Waiting for your answer',
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
    titlePlaceholder: 'Title (optional)',
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
    yourAnswerPending: 'Your answer is waiting for approval. You can write again once it is decided.',
    yourTurn: '{name} is waiting for your answer.',
    start: 'Ask {name} anything about the course.',
    overseeing: 'You are reading this as course staff.',
  },
  // Why an answer may not come.
  availability: {
    never: '{name} has never connected: nothing may be running it, so an answer may not come.',
    offline: '{name} was last seen {time}: an answer may take a while.',
    gone: '{name} is no longer in the course. Start a new conversation with someone else.',
    paused: '{name} is paused in this course and cannot answer now.',
    notAnswering: '{name} is not answering questions now.',
  },
  blocked: {
    archived: 'This course is archived: nothing more can be written.',
    overseer: 'Only the two taking part write here.',
    nothingToAnswer: 'Nothing has been asked yet.',
    answerPending: 'Your answer is waiting for approval.',
  },
  closed: {
    title: 'This conversation is closed.',
    said: 'They said: “{reason}”',
    readOnly: 'It stays readable; nothing more can be written in it.',
    startNew: 'Start a new conversation',
  },
  composer: {
    label: 'Your message',
    askPlaceholder: 'Ask {name}…',
    answerPlaceholder: 'Answer {name}…',
    send: 'Send',
    hint: 'Enter to send, Shift+Enter for a new line',
    hintTouch: 'Tap the button to send',
    count: '{n} / {max} characters',
  },
  // Who can read a conversation (Core's visible_to).
  conflict: {
    moved_on: 'They wrote again before your answer went in. Their newest message is shown now: answer that one.',
    already_answered: 'That message has been answered already, so your answer was not posted.',
    answer_pending: 'An answer of yours to that message is waiting for approval already.',
    closed: 'This conversation is closed, so nothing more can be written in it.',
  },
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
  close: {
    button: 'Close',
    title: 'Close this conversation?',
    bodyOpener:
      'Nothing more can be written in it; it stays readable. Anything you give as a reason is shown to the other participant.',
    bodyRespondent:
      'Nothing more can be written in it, and {name} will have to start a new one. Anything you give as a reason is shown to them.',
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
