// 小組作業（由各小組繳交的作業，AIShie-Core #74）：作業的表單和頁面、學生以小組身分做的作業、
// 小組的提交，以及按小組列出的名單。
export default {
  // 作業的屬性：由各小組繳交。
  tag: '小組作業',
  /** 名單中代表讀者本人的稱呼（「王健和你」）。 */
  you: '你',
  /** 句首的讀者本人。 */
  youStart: '你',
  /** 頁面無法向讀者說出名字的成員，用於句中。 */
  someone: '一位成員',
  states: {
    // 學生不屬於作業所用分組中的任何小組（名單上的狀態）。
    no_group: '未分組',
  },
  form: {
    label: '小組作業',
    toggle: '每個小組為全體組員繳交一份作業',
    set: '分組',
    setPlaceholder: '選擇分組',
    setRequired: '請選擇由哪個分組的小組繳交',
    groups: '{n}個小組',
    archived: '已封存',
    hint: '分組中的每個小組為組員繳交一份作業；不屬於任何小組的學生無須繳交。是否小組作業、用哪個分組，只能在有人開始做之前更改。',
    locked: '已有人開始做這份作業，是否小組作業及用哪個分組已不能再更改。',
    noSets: '這個課程還沒有分組。',
    makeSet: '到「小組」頁建立分組',
    unreadable: '暫時無法讀取課程的分組，因此不能在這裡設定小組作業。',
  },
  // 與小組作業有關的拒絕原因，按原因說明。
  refusal: {
    assignment_has_work: '已有人開始做這份作業（草稿、已繳交的作業或缺交紀錄），是否小組作業及用哪個分組已不能再更改。',
    set_archived: '該分組已封存。請選擇另一個分組，或先將它恢復。',
    no_group:
      '你不屬於這份作業所用分組中的任何小組，所以暫時沒有可以開始的作業。請在報名開放期間報名加入小組，或請老師把你編入小組。',
    group_assignment: '這是小組作業：要記錄為缺交的是小組，而不是個別學生。',
    group_empty: '這個小組沒有組員，無法為它記錄作業。',
    members_changed: '頁面讀取後，你的小組組員已有變動。請先看清楚現在是為哪些組員繳交，然後再繳交一次。',
    draft_changed: '你開始編輯後，小組裡有人修改了草稿。請載入草稿現在的內容，或保留你的文字並以它覆蓋。',
    not_a_group_assignment: '這份作業不是小組作業。',
  },
  // 作業頁。
  page: {
    set: '分組',
    myGroup: '你的小組',
    noGroup: '尚未分組',
  },
  // 學生以小組身分做的作業（作業頁）。
  work: {
    group: '你的小組',
    members: '組員',
    noGroupTitle: '你還沒有加入任何小組',
    noGroupBody:
      '這是小組作業：「{set}」中的每個小組為組員繳交一份作業。你不屬於其中任何小組，所以沒有可以開始或繳交的作業。',
    noGroupBodyNoSet: '這是小組作業：每個小組為組員繳交一份作業。你還沒有加入任何小組，所以沒有可以開始或繳交的作業。',
    signupUntil: '報名開放至{closes}：請選擇要加入的小組。',
    signupOpen: '報名已開放：請選擇要加入的小組。',
    signupWhere: '可在課程的「小組」頁加入小組。',
    askTeacher: '報名尚未開放。請老師把你編入小組。',
    chooseGroup: '選擇小組',
    noGroupNow: '你之前與小組繳交過的作業列在下方。',
    start: '開始小組草稿',
    startHint: '你的小組共用一份草稿：每位組員都可以修改，任何一位組員都可以代表小組繳交。',
    alreadyStarted: '小組已有人開始了草稿，草稿如下。',
    text: '小組的答案',
    revised: '{name}最後修改於{when}',
    conflictTitle: '你編輯期間，{name}於{when}修改了草稿',
    conflictBody: '你可以載入草稿現在的內容（會捨棄你在這裡的修改），或繼續編輯你的版本：儲存後會取代對方寫的內容。',
    conflictLoading: '正在讀取草稿現在的內容…',
    showTheirs: '草稿現在的內容',
    loadTheirs: '載入現在的內容',
    keepMine: '繼續編輯我的版本',
    resolveFirst: '請先載入草稿現在的內容，或選擇繼續編輯你的版本。',
    handedInByOther: '{name}已繳交草稿。',
    handedInByOtherUnsaved: '{name}已繳交草稿，當中不包括你未儲存的修改。這些修改保留在下方，可供你複製。',
    // 草稿開啟期間，學生被調離小組（或分組）。
    notInGroupNow: '你已不在{group}，因此不能再修改或繳交它的草稿。',
    notInGroupNowUnnamed: '你已不在這份草稿所屬的小組，因此不能再修改或繳交它。',
    // 學生在小組草稿中輸入但未儲存的內容，而草稿已不再屬於他們。
    keptTitle: '你未儲存的內容',
    keptHint: '這些內容不在任何草稿中，只會保留在這個頁面，直到你捨棄為止。如要再用，請先複製。',
    keptCopyFailed: '無法自動複製。請自行選取文字並複製。',
    keptDiscard: '捨棄',
    keptDiscardTitle: '要捨棄你未儲存的內容嗎？',
    keptDiscardBody: '這些內容沒有保存在其他地方，捨棄後無法復原。',
    changedBeforeHandIn: '繳交前草稿已有變動：{name}於{when}修改了它。請重新閱讀後再繳交。',
    handInTitle: '要為{group}繳交第{n}次提交嗎？',
    handInFor: '這份作業會為{names}繳交：繳交後就是他們的作業，之後小組有任何變動也不會改變。',
    handInLeftOutMe: '你不會包括在內：你已是{group}這份作業的成員。',
    handInFixed: '繳交後便不能再修改；如之後要更改，小組需要開始新一次提交。',
    handedInFor: '已為{names}繳交。',
    handedInForLate: '已為{names}繳交，並標示為遲交。',
    leftOutMe: '你沒有包括在內：你已是另一個小組這份作業的成員。老師可以更改這份作業屬於哪些人。',
    leftOut: '{names}沒有包括在內：他們已是另一個小組這份作業的成員。老師可以更改這份作業屬於哪些人。',
    notPartNow:
      '你這份作業的成果，是你與{group}一起繳交的那份。你的小組現在繳交的作業不會包括你；老師可以更改作業屬於哪些人。',
    handedInBy: '由{name}繳交',
    forMembers: '組員：{names}',
    recordedFor: '為{names}記錄為缺交',
  },
  // 作業名單（按小組）。
  roster: {
    view: '顯示',
    byGroup: '按小組',
    byStudent: '按學生',
    chipsLabel: '按作業進度劃分的小組',
    group: '小組',
    members: '現在的組員',
    handedIn: '繳交',
    handedInFor: '為{names}繳交',
    missingFor: '為{names}記錄為缺交',
    workOf: '{group}的作業',
    nobody: '沒有組員',
    handedInBy: '由{name}繳交',
    empty: '這個分組還沒有小組。',
    emptyStudent: '這位學生不屬於這裡列出的任何小組。',
    noGroupTitle: '未分組：{n}位學生',
    noGroupNote: '他們無須繳交這份作業，也不會被記錄為缺交。請把他們各自編入分組中的小組：一人一組也可以。',
    noGroupMore: '尚未載入的頁面可能還有其他學生。',
    // 小組組員下方，給只涵蓋部分學生的席位：席位未涵蓋的組員人數。
    unreached: '另有{n}位組員不在你的席位涵蓋範圍內',
    // 同上，並說明因此不能在這裡把小組記錄為缺交：須涵蓋全部組員。
    unreachedMissing: '另有{n}位組員不在你的席位涵蓋範圍內，因此須由席位涵蓋全部組員的人把小組記錄為缺交',
    openSet: '開啟分組',
    recordMissing: '記錄為缺交',
    confirmTitle: '要把{group}記錄為缺交嗎？',
    confirmBody:
      '{group}會被記錄為沒有繳交「{assignment}」，記錄屬於現在的組員：{names}。之後便可以評分。如小組之後繳交作業，作業會取代這筆紀錄。',
    done: '已把{group}記錄為缺交。',
    noGroupCell: '無',
  },
  // 提交列表。
  list: {
    whose: '作業屬於',
  },
}
