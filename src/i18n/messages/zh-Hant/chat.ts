// 與課程代理的對話：每個頁面旁的對話面板，以及其中的一段對話。
export default {
  panel: {
    title: '對話',
    toggle: '與代理對話',
    toggleUnread: '與代理對話：{n} 則未讀',
    toggleTip: '與代理對話（{key}）',
    course: '課程',
    new: '新對話',
    newTip: '開始新對話',
    history: '過往對話',
    close: '關閉對話面板',
    resize: '調整對話面板寬度',
    backToHistory: '返回過往對話',
    backToAgents: '返回代理列表',
    pickTitle: '向代理提問',
    pickHint: '你在 {course} 可以提問的代理：課程自己的代理，以及你的個人助理。',
    noCourses: '你的課程都不允許你向代理提問。',
  },
  history: {
    title: '你的對話',
    scope: '課程範圍',
    thisCourse: '這個課程',
    allCourses: '所有課程',
    empty: '你還沒有在這個課程向代理提問。',
    emptyAll: '你還沒有向任何代理提問。',
    untitled: '未命名',
    unread: '新回覆',
    moreFailed: '無法載入更多對話，請再試一次。',
  },
  respondents: {
    empty: '這裡暫時沒有可以回答你問題的代理。',
    offlineHint: '這個代理目前似乎沒有在運行，回覆可能需要一段時間。',
    sharedHint: '它也會回答其他成員，會記住每個人寫給它的內容，並可能轉述給他們。',
    agentPage: '前往它的頁面',
  },
  between: '{opener} → {respondent}',
  messagesLabel: '訊息',
  older: '較早的訊息',
  olderFailed: '無法載入，請再試一次。',
  empty: {
    opener: '還沒有任何訊息。在下方向 {name} 提出你的問題吧。',
    other: '還沒有任何訊息。',
  },
  // The line in the messages while an answer is awaited: the agent at work, and for how long.
  status: {
    thinking: '思考中…',
    seconds: '{s}s',
    minutes: '{m}m {s}s',
  },
  typing: '正在等待 {name}…',
  held: '等待批准中：獲批准後才會在這裡顯示。',
  myActions: '我的操作',
  trouble: '連線到伺服器時遇到問題，正在重試…',
  new: {
    intro: '開始與 {name} 對話。傳送第一則訊息即會開啟對話。',
    yourAgent: '這是你自己的代理：它代表你行事，權限永不超過你的席位。',
  },
  proposed: {
    title: '等待批准',
    body: '你與 {name} 的對話需經批准後才會開始。你可以在「我的操作」中查看進度。',
  },
  // What the line above the composer says.
  state: {
    waitingApproval: '每則回覆都須經批准，你才會看到。',
    answerPending: '有一則回覆正在等待批准。',
    withdrawn: '你撤回了問題，{name} 不會回答它。',
    start: '有任何關於課程的問題，都可以問 {name}。',
    overseeing: '你正以課程教職員的身分閱讀這段對話。',
    readOnly: '現在由代理在對話中回答問題，你可以閱讀這段對話。',
  },
  // Why an answer may not come.
  availability: {
    gone: '{name} 已不在這個課程中。請改為與其他人開始新的對話。',
    paused: '{name} 在這個課程中已被暫停，目前無法回覆。',
    notAnswering: '{name} 目前不回答問題。',
  },
  blocked: {
    archived: '這個課程已封存，無法再發言。',
  },
  closed: {
    title: '這段對話已結束。',
    said: '對方表示：「{reason}」',
    startNew: '開始新的對話',
  },
  composer: {
    label: '你的訊息',
    askPlaceholder: '向 {name} 提問…',
    send: '傳送',
    sendTip: '傳送（Enter）· Shift+Enter 換行',
    stop: '停止',
    stopTip: '停止：撤回問題，放回輸入框',
    // The list a slash opens (commands), and what the empty box hints at.
    commands: '指令',
    hintCommands: '/ 指令',
    hintMentions: "{'@'} 引用作業或教材",
    count: '{n} / {max} 字',
  },
  // What a slash at the start of the box offers.
  commands: {
    new: '新對話',
    history: '對話紀錄',
    close: '結束對話',
  },
  // What an @ offers: the course's assignments and materials, whose title it writes in, quoted.
  mention: {
    label: '作業與教材',
    insert: '「{title}」',
    loading: '載入作業與教材…',
    none: '沒有標題含「{q}」的作業或教材。',
    empty: '這個課程還沒有你看得到的作業或教材。',
    kind: {
      assignment: '作業',
      material: '教材',
    },
  },
  // A new conversation's first words, offered to start with; a click puts them in the box.
  suggestions: {
    title: '可以這樣開始',
    explainAssignment: '解釋這份作業的要求',
    checkReasoning: '幫我檢查我的思路',
    summarizeWeek: '總結這週的教材',
    practice: '出幾道練習題給我',
  },
  conflict: {
    closed: '這段對話已經關閉，不能再寫入任何內容。',
  },
  // Who can read a conversation (Core's visible_to).
  visibleTo: {
    button: '誰可以閱讀',
    title: '誰可以閱讀這段對話',
    participants: '對話雙方',
    overseers: '負責審批開啟者操作的課程教職員',
    actionRecord: '課程中任何負責審批操作的人，可透過每則訊息的操作紀錄閱讀',
    respondentAnswersOthers: '回答的一方也會回答其他成員：它會記住每個人寫的內容，並可能把這裡寫的內容轉述給他們',
    sharedNote: '對方也會回答其他成員：你在這裡寫的內容，它可能會轉述給他們。',
    note: '每則訊息都經由一項操作寫入，其紀錄會保留原文，即使訊息已被撤回。',
  },
  message: {
    retract: '撤回',
    // Under a message, on hover: copy it (as Markdown), and take the question awaiting its answer back to edit it.
    copy: '複製訊息',
    edit: '編輯',
    editTip: '撤回這則問題，放回輸入框修改後再送出',
    retractedByYou: '你已撤回這則訊息。',
    retractedBy: '{name} 已撤回這則訊息。',
    retractedByStaff: '課程教職員已撤回這則訊息。',
    reason: '原因：{reason}',
  },
  reasonPlaceholder: '原因（選填）',
  reasonTooLong: '最多 {max} 字',
  // The ⋯ menu in a conversation's header: who can read it, how its answers arrive, closing it.
  menu: {
    label: '對話選項',
  },
  close: {
    title: '要結束這段對話嗎？',
    bodyOpener: '結束後無法再發言，但內容仍可閱讀。你填寫的原因會顯示給對方。',
    confirm: '結束對話',
    done: '對話已結束',
  },
  // A question awaiting its answer, taken back to the composer: to edit it, or to stop waiting.
  edit: {
    done: '問題已撤回並放回輸入框，修改後再送出即可。{name} 不會回答已撤回的問題；若它已開始作答，答案仍可能送達。',
  },
  stop: {
    done: '已停止：問題已撤回並放回輸入框。{name} 不會回答已撤回的問題；若它已開始作答，答案仍可能送達。',
  },
  retract: {
    title: '要撤回這則訊息嗎？',
    bodyMine: '這則訊息的內容將不再在此顯示，但寫入它的操作紀錄仍會保留原文。',
    bodyStaff: '{name} 的這則訊息將不再在此顯示，但寫入它的操作紀錄仍會保留原文。',
    confirm: '撤回',
    done: '訊息已撤回',
  },
}
