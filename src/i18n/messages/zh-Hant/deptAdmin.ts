// 部門樹狀架構、部門管理員，以及部門管理員在管理頁面可做的事：管理其任命範圍內的課程與部門，
// 並以電子郵件查找、邀請人員及指派席位。這些都不涉及課程之內的操作。
export default {
  tree: {
    subtitle: '你所管理的部門及其下的一切。你可在自己的部門之下建立部門，並為任命範圍以下的部門改名、搬移及任命管理員。',
    newTop: '新增最上層部門',
    newChild: '在此新增部門',
    newTopTitle: '新增最上層部門',
    newChildTitle: '在「{name}」之下新增部門',
    rename: '改名',
    renameTitle: '為「{name}」改名',
    move: '搬移',
    moveTitle: '搬移「{name}」',
    moveIntro:
      '其下的部門與課程會一併搬移，管理權亦隨之改變：只經由不再位於其上的部門取得管理權的管理員，會即時失去管理權；新上層部門的管理員則即時取得。課程之內的一切維持不變。',
    moveTo: '搬到以下部門之下',
    movePick: '選擇目的地',
    moveNone: '你所管理的部門之中，沒有可以搬往的地方。',
    top: '最上層',
    under: '上層部門',
    atTop: '位於最上層',
    name: '名稱',
    namePlaceholder: '例如：電子計算學系',
    courses: '課程',
    admins: '管理員',
    yours: '由你管理',
    inPath: '位於{path}',
    depthLimit: '部門最多只能有{n}層。',
    created: '已建立部門',
    renamed: '已為部門改名',
    moved: '已搬移部門',
    viewCourses: '直屬「{name}」的課程',
    viewAdmins: '「{name}」的管理員',
    more: '可對「{name}」進行的操作',
    empty: '你沒有管理任何部門。',
    notHere: {
      here: '目前所在位置',
      tooDeep: '連同其下部門會超過層數上限',
      nameTaken: '該處已有同名部門',
    },
  },

  admins: {
    title: '「{name}」的管理員',
    intro:
      '他們在管理頁面管理此部門及其下屬部門的所有課程，一如平台管理員：建立、修改、啟用、封存及搬移這些課程，並指派講師；亦可在其下建立部門，並為其下的部門改名、搬移及任命管理員。任命不會給予任何課程的席位：如需在課程之內工作，須像其他人一樣先為自己指派席位。',
    here: '在此任命',
    above: '經由「{dept}」',
    appointedBy: '由{name}於{date}任命',
    removedBy: '由{name}於{date}結束',
    ended: '已結束',
    none: '此部門尚未任命管理員。',
    add: '任命管理員',
    addHint: '請以對方完整的電子郵件地址查找。只有人員可以獲任命，代理不可以；亦不能任命自己。',
    appoint: '任命{name}',
    remove: '結束任命',
    removeTitle: '要結束{name}的任命嗎？',
    removeConfirm: '{name}會即時停止管理「{dept}」，其做過的操作會保留紀錄。若對方亦經由上層部門管理此部門，該管理權維持不變。',
    added: '已任命{name}',
    removed: '已結束{name}的任命',
    cannotHere: '此部門的管理員由其上層部門的管理員任命。',
    cannotTop: '最上層部門的管理員由平台管理員任命。',
    showRemoved: '顯示過往任命',
    coveredAbove: '{name}已經由上層部門管理此部門；若該項任命結束，這項任命可讓對方繼續管理。',
    blocked: {
      self: '不能任命自己。',
      agent: '只有人員可以管理部門，代理不可以。',
      suspended: '此帳戶已被停用，不能獲任命。',
      already: '對方已是此部門的管理員。',
    },
  },

  lookup: {
    email: '電子郵件或學號／工號',
    placeholder: "name{'@'}example.edu",
    hint: '請輸入對方完整的電子郵件地址，或完整的學號／工號，不設部分搜尋。',
    invalid: "請輸入完整的電子郵件地址（例如 name{'@'}example.edu），或完整的學號／工號。",
    notFoundLoginId: '沒有人以此學號／工號登記。要邀請新成員，請以對方的電子郵件查找。',
    find: '查找',
    notFound: '沒有人以此電子郵件登記。你可以邀請對方。',
    notFoundPlain: '沒有人以此電子郵件登記。',
    suspended: '此帳戶已被停用。',
    notSignedIn: '尚未登入過。',
    invitePending: '已邀請，{date}前有效',
    inviteExpired: '邀請已於{date}過期',
  },

  invite: {
    new: '邀請新人員',
    title: '邀請新人員',
    intro: '系統會為對方登記，並產生讓對方設定密碼的連結。請自行把連結交給對方：AIshie 不會發送電子郵件。',
    name: '姓名',
    namePlaceholder: '陳大文',
    email: '電子郵件',
    submit: '登記並邀請',
    again: '再次邀請',
    againHint: '對方尚未登入過。新連結會取代先前給對方的連結。',
    seatThem: '指派{name}為講師',
    emailTaken: '此電子郵件已有人登記，請改為指派該人員。',
    done: '已登記並邀請{name}',
  },

  courses: {
    subtitle: '你所管理的部門及其下屬部門的課程',
    within: '包括下屬部門',
    noTerms: '尚未建立任何學期。學期由平台管理員建立。',
  },

  course: {
    move: '搬到其他部門',
    moveTitle: '搬移{code}',
    moveIntro:
      '成員、他們的席位及課程內的一切都維持不變。管理權隨所屬部門改變：原部門的管理員若不管理新部門，會即時失去管理權。',
    moveTo: '部門',
    moved: '已搬到「{dept}」',
    notSeated:
      '你沒有加入此課程，因此課程本身的頁面會拒絕你：管理員在此管理課程，而不是從課程內部操作。如需在課程內工作，請在下方將自己指派為講師。',
  },

  home: {
    explain:
      '管理部門的身分不會讓你進入其課程：每個人在課程裡看到什麼，取決於他在該課程的席位。要打開這些課程，請到課程的管理頁指派講師，或指派你自己。',
  },

  noSeat: {
    body: '管理其所屬部門的身分不會讓你進入課程：每個人在課程裡看到什麼，取決於他在該課程的席位。請到這門課程的管理頁指派講師，或指派你自己。',
  },

  // 依 Core 給出的原因（details.reason）說明拒絕。
  errors: {
    department_out_of_scope: '這不在你所管理的部門範圍內。',
    destination_out_of_scope: '只能搬到你所管理的部門；最上層由平台管理員負責。',
    name_taken: '該處已有同名的部門。',
    same_name: '它已經是這個名稱。',
    too_deep: '這會令部門超過{max_depth}層。',
    cycle: '部門不能搬到自身或其下屬部門之下。',
    same_parent: '它已經在那裡。',
    same_department: '課程已屬於該部門。',
    not_a_person: '只有人員可以管理部門，代理不可以。',
    actor_suspended: '該帳戶已被停用。',
    self_appointment: '不能任命自己。',
    already_admin: '對方已是此部門的管理員。',
    not_admin: '對方並非此部門的管理員。',
    email_taken: '此電子郵件已有人登記，請改為指派該人員。',
    invite_not_allowed:
      '只有在對方從未登入、而且在你所管理的部門以外沒有任何席位或權限時，你才可再次邀請對方。請向平台管理員求助。',
    // 部門管理員邀請時，actor.invite 拒絕的原因（details.why）。
    inviteWhy: {
      signed_in: '對方曾經登入，新的邀請會取代其密碼。只有平台管理員可以這樣做：如對方忘記了密碼，請向平台管理員求助。',
      platform_role: '對方是平台管理員，只有其他平台管理員可以邀請對方。',
      not_a_person: '這是代理，不是人員：代理使用 API 權杖，而不是邀請連結。',
      administers: '對方本身是部門管理員，只有平台管理員可以邀請對方。',
      owns_agents: '對方擁有代理，邀請連結會連同這些代理一併交出，因此只有平台管理員可以邀請對方。',
      seated_elsewhere: '對方在你所管理的部門以外的課程有席位，只有平台管理員可以邀請對方。',
    },
  },
}
