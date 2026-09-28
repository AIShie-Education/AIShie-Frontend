// My agents (/account/agents): the agents a person owns, their tokens and seats.
export default {
  title: '我的代理',
  subtitle: '你擁有的代理：把它們連線，並帶入你的課程替你工作',
  notHuman: '只有「人」才能擁有代理。以代理身分登入時，並沒有屬於自己的代理。',

  // The link from the Account page.
  accountCard: {
    title: '我的代理',
    body: '由你擁有、以你的代表身分在課程中工作的 AI 助手及其他程式。',
    open: '管理我的代理',
  },

  about: {
    title: '代理如何運作',
    here: {
      title: '在這裡登記',
      body: '代理是 AIshie 中的一個身分：一個名稱、它的權杖，以及它所在的課程。這裡不會保存任何模型、提示詞或金鑰。',
    },
    runtime: {
      title: '在別處運行',
      body: '負責思考與回答的是「執行環境」：在你電腦上的程式，或你使用的服務。它以代理的權杖連線，向 AIshie 領取工作。',
    },
    delegate: {
      title: '只代表你行事',
      body: '在課程中，你的代理就是你的代表：權限永遠不會超過你自己的席位，觸及範圍不會更廣，你離開課程時它也會一併離開。',
    },
  },

  standing: {
    active: '啟用中',
    suspendedByMe: '已由你停用',
    suspendedByAdmin: '已由管理員停用',
  },

  list: {
    title: '你的代理',
    new: '新增代理',
    count: '沒有啟用中的代理 | 1 個啟用中 | {n} 個啟用中',
    countOf: '{n} / {limit} 個啟用中',
    suspendedDoNotCount: '已停用的代理不計入你可擁有的數量。',
    empty: '你還沒有任何代理。建立一個、發給它權杖，再把執行環境連上去。',
    emptyNoSelfService: '你還沒有任何代理。在這裡，代理由管理員登記：請向你的管理員申請。',
    seats: '未加入任何課程 | 已加入 1 個課程 | 已加入 {n} 個課程',
    requests: '1 項申請待批 | {n} 項申請待批',
    created: '建立於',
  },

  limit: {
    noSelfService:
      '在這裡只有管理員可以登記代理：請向你的管理員申請。代理歸你所有後，你可以在此頁為它發放權杖，並把它帶進你的課程。',
    reached: '你已有 {limit} 個未停用的代理，已達上限。請先停用一個不再使用的代理，才能再建立新的。',
  },

  create: {
    title: '新增代理',
    intro: '替它取個名稱。它如何運行，全由運行它的程式負責；這裡只記錄它是誰、它的權杖，以及你帶它加入的課程。',
    name: '名稱',
    namePlaceholder: '例如：溫習小幫手',
    nameHint: '它在各處顯示的名稱：成員名單、對話、審批等。之後可以更改。',
    nameRequired: '請輸入名稱',
    next: {
      token: '下一步：發給它一個權杖。',
      runtime: '用該權杖啟動執行環境，讓代理連線。',
      course: '把它帶入你有席位的課程。',
    },
    submit: '建立代理',
    done: '已建立 {name}',
  },

  rename: {
    title: '重新命名代理',
    hint: '新名稱會在代理出現的每一處顯示，包括過往紀錄。',
    done: '已重新命名',
  },

  detail: {
    title: '代理',
    subtitle: '它的執行環境、權杖，以及它工作的課程',
    notFound: '你沒有這個 ID 的代理。',
    about: '基本資料',
    presence: '連線狀態',
    created: '建立於',
    id: '身分 ID',
    delegateNote:
      '持有它任何一個權杖的人，都會以這個代理的身分行事，也就是以你的代表身分行事：在每個課程中，權限都不會超過你自己的席位。',
    rename: '重新命名',
    suspend: '停用',
    reactivate: '重新啟用',
    suspendTitle: '停用 {name}？',
    suspendBody:
      '從現在起，它在所有課程中的每一個操作都會被拒絕，直至你重新啟用為止。它的席位、權杖及紀錄都會保留。已停用的代理不計入你可擁有的數量。',
    suspended: '已停用 {name}',
    reactivated: '{name} 已重新啟用',
    suspendedByMe: '你已停用這個代理：它的每一個操作都會被拒絕。重新啟用即可讓它恢復工作。',
    suspendedByAdmin: '這個代理已被管理員停用',
    suspendedByAdminBody: '它的每一個操作都會被拒絕，而且只有管理員才能解除停用。如你認為應該解除，請聯絡平台管理員。',
    adminOnly: '這個代理由管理員停用，只有管理員才能解除。',
  },

  // How it runs, when run by another AI tool or an AIshie runtime of one's own (ConnectRuntimeCard).
  connect: {
    tokenTodo: '它還沒有權杖：工具需要用權杖連接。',
    tokenDone: '它已有一個有效的權杖。',
    waiting: '它的權杖尚未被使用過。',
    waitingWatching: '正在等待它連線…本頁每隔數秒會自動檢查一次。',
    toolIntro: 'Claude、ChatGPT、代理 SDK 或任何其他 MCP 用戶端都可以充當這個代理：把這個地址交給它，並在這個標頭中放入代理的其中一個權杖。',
    endpoint: 'MCP 端點（Streamable HTTP）',
    header: '標頭',
    headerHint: '把 {placeholder} 換成代理的其中一個權杖。請妥善保密：任何持有它的人都能以這個代理的身分行事。',
    claudeHint: '在 Claude 中：用這個網址新增自訂連接器，選擇「No sign-in」，並新增名為 authorization 的標頭，值為 Bearer {placeholder}。',
    runtimeIntro: '適用於自行營運 AIshie Agent Runtime 的人：把這個代理檔案放進執行環境的 agents 目錄，並把權杖放在檔案所指定的秘密中。',
    agentFile: 'AIshie Agent Runtime 的代理檔案（YAML）',
    agentFileHint:
      '把權杖存放在執行環境秘密目錄中的 {file} 檔案，或環境變數 {variable}；切勿寫進代理檔案，執行環境會拒絕寫在那裡的權杖。',
    modelExample: 'model 區塊只是示例：請改成你自己的供應商、模型和金鑰。',
    courseTodo: '在加入課程之前，它甚麼都做不了：請把它帶入你有席位的課程。',
    courseWaiting: '安排它加入課程的申請正等待講師批准。',
    courseDone: '已加入 1 個課程。 | 已加入 {n} 個課程。',
  },

  copy: {
    done: '已複製到剪貼簿',
    failed: '無法自動複製，請自行選取後複製。',
  },

  tokens: {
    title: '權杖',
    new: '建立權杖',
    intro:
      '執行環境用來連線的憑證。撤銷其中一個，使用它的執行環境從下一次呼叫起便會被拒絕；代理本身及其他權杖不受影響。',
    showInactive: '顯示已撤銷及已過期的權杖（{n}）',
    empty: '還沒有任何權杖。',
    unlabelled: '未加標籤',
    lastUsed: '最後使用',
    neverUsed: '從未使用',
    created: '建立於',
    expires: '到期',
    noExpiry: '不會到期',
    issuedBy: '簽發者',
    someoneElse: '管理員',
    revokedAt: '撤銷於',
    state: {
      active: '有效',
      revoked: '已撤銷',
      expired: '已過期',
    },
    revoke: '撤銷',
    revokeTitle: '撤銷這個權杖？',
    revokeBody: '使用 {token} 的執行環境，從下一次以 {name} 身分呼叫起便會被拒絕。',
    revokeKeeps: '代理會保留它的席位及其他權杖。已撤銷的權杖永遠無法再使用。',
    revoked: '已撤銷權杖',
  },

  issue: {
    title: '為 {name} 建立權杖',
    intro:
      '供 {name} 的一個執行環境使用。持有它的人會以這個代理的身分，也就是以你的代表身分行事：權限永遠不會超過你自己的席位。',
    suspended: '這個代理已停用：在重新啟用之前，這個權杖會被拒絕。',
    label: '標籤',
    labelPlaceholder: '例如：我手提電腦上的執行環境',
    labelHint: '註明它在哪裡運行，方便日後辨認。',
    labelRequired: '請輸入標籤',
    expiry: '到期',
    after: '在若干天後',
    never: '永不',
    days: '天',
    daysInvalid: '請輸入 1 至 3650 之間的整數天數',
    noExpiryWarn: '永不到期的權杖會一直有效，直至被撤銷。無人看管的執行環境，最好設定到期日。',
    submit: '建立權杖',
  },

  reveal: {
    title: '{name} 的新權杖',
    warning: '請立即複製。權杖不會儲存在任何地方，之後亦不會再顯示。',
    token: '權杖',
    listedAs: '在清單中顯示為',
    done: '我已複製',
    closeUncopiedTitle: '不複製就關閉？',
    closeUncopied: '這個權杖不會再顯示。如果遺失了，請撤銷它並建立新的。',
    closeAnyway: '仍然關閉',
    missingTitle: '無法顯示權杖',
    missing: '這個權杖是由同一請求的較早一次嘗試建立的，而權杖只會顯示一次。如果當時沒有保存，請撤銷它並建立新的。',
    revokeIt: '撤銷它',
  },

  seats: {
    title: '課程',
    intro: '它以你的代表身分所在的課程，以及它現時在那裡可以做的事：它自己的權限，並以你的席位為上限。',
    empty: '它還未加入任何課程。',
    students: '學生',
    assignments: '作業',
    ends: '席位結束',
    noEnd: '未設定',
    mayNow: '現時可以',
    nothing: '沒有任何權限',
    nothingNow: '在它或你的席位暫停期間，或課程已封存時，它甚麼都不能做',
    allPerms: '所有權限',
    cappedHint: '每一項都取代理自己的等級與你的等級之中較低者。',
    withdraw: '撤出',
    withdrawTitle: '把它從 {course} 撤出？',
    withdrawBody:
      '{name} 會失去在 {course} 的席位，它提出而尚未有人決定的申請會一併取消。它做過的一切都會保留紀錄。之後再帶它加入，會是一個新席位：一切從頭開始。',
    withdrawn: '已從 {course} 撤出',
    withdrawnCancelled: '已從 {course} 撤出，並取消了它的 1 項申請 | 已從 {course} 撤出，並取消了它的 {n} 項申請',
    archived: '已封存的課程不接受任何更改，包括這一項。',
  },

  requests: {
    title: '等待批准',
    intro: '安排它加入課程、而講師尚未決定的申請。',
    since: '申請於',
    takeBack: '撤回',
    takeBackTitle: '撤回這項申請？',
    takeBackBody: '安排 {name} 加入 {course} 的申請將被取消。你可以之後再提出新的申請。',
    takenBack: '已撤回加入 {course} 的申請',
  },

  bring: {
    open: '帶入課程',
    title: '把 {name} 帶入課程',
    intro: '它會以你的代表身分加入：在那裡，它能做的永遠不會比你多，觸及範圍不會更廣，你離開後它也不會留下。',
    course: '課程',
    noCourses: '你沒有在任何課程中擁有席位。',
    noneAvailable: '你的課程目前都不能加入這個代理；每個課程旁都註明了原因。',
    needsApproval: '須先經講師批准',
    blocked: {
      archived: '已封存：不接受任何更改',
      paused: '你在這裡的席位已暫停',
      delegate: '你在這裡是以他人代表的身分入席',
      noPerm: '你在這裡的席位不允許帶入代理',
      seated: '它已在這個課程中',
      requested: '安排它加入這裡的申請正在等待批准',
    },
    purpose: '用途',
    purposeCourse: '供學生提問的課程代理',
    purposeHelp: {
      personal: '你的個人助手：它能閱讀你能閱讀的內容（如果你是學生，就是你自己的作業與成績），並只回答你。',
      course:
        '課程代理：每位學生都可以向它查詢課程教材，而它可能會把某位學生告訴它的內容轉述給其他人。它不會閱讀任何人的作業。由於你負責管理這個課程的成員，因此可以選擇此項。',
    },
    preview: '它將獲得的權限',
    level: {
      autonomous: '帶入後會立即入席。',
      pending_review: '帶入後會立即入席，之後由講師覆核。',
      confirm_required: '這會送出一項申請：須經講師批准，你的代理才會入席。申請在等待期間，你可以隨時撤回。',
      denied: '你在這裡的席位不允許帶入代理。',
    },
    answers: '誰可以向它提問',
    answersYou: '只有你',
    answersCourse: '你和學生：它會記住每個人寫的內容，並可能轉述給其他人',
    students: '可觸及的學生',
    assignments: '作業',
    ends: '席位結束',
    noEnd: '未設定',
    may: '可以',
    reach: {
      students: {
        all: '全班',
        nobody: '不觸及任何人的作業',
        you: '只有你：你自己的作業與成績',
        listed: '1 位學生 | {n} 位學生',
      },
      assignments: {
        all: '所有作業',
        nobody: '沒有',
        listed: '1 份作業 | {n} 份作業',
      },
    },
    cappedHint: '已按你自己的席位設定上限。負責管理課程成員的人日後可以調整它的權限，但永遠不會超過你的權限。',
    submit: '帶入',
    submitRequest: '送出申請',
    done: '{name} 已加入 {course}',
  },
}
