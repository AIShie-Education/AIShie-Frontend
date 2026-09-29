// 部门树状结构、部门管理员，以及部门管理员在管理页面可做的事：管理其任命范围内的课程与部门，
// 并以邮箱查找、邀请人员及指派席位。这些都不涉及课程之内的操作。
export default {
  tree: {
    subtitle: '你所管理的部门及其下的一切。你可在自己的部门之下创建部门，并为任命范围以下的部门改名、移动及任命管理员。',
    newTop: '新建顶层部门',
    newChild: '在此新建部门',
    newTopTitle: '新建顶层部门',
    newChildTitle: '在“{name}”之下新建部门',
    rename: '改名',
    renameTitle: '为“{name}”改名',
    move: '移动',
    moveTitle: '移动“{name}”',
    moveIntro:
      '其下的部门与课程会一并移动，管理权也随之改变：只经由不再位于其上的部门取得管理权的管理员，会立即失去管理权；新上级部门的管理员则立即取得。课程之内的一切保持不变。',
    moveTo: '移动到以下部门之下',
    movePick: '选择目的地',
    moveNone: '你所管理的部门之中，没有可以移往的地方。',
    top: '顶层',
    under: '上级部门',
    atTop: '位于顶层',
    name: '名称',
    namePlaceholder: '例如：计算机科学系',
    courses: '课程',
    admins: '管理员',
    yours: '由你管理',
    inPath: '位于 {path}',
    depthLimit: '部门最多只能有 {n} 层。',
    created: '已创建部门',
    renamed: '已为部门改名',
    moved: '已移动部门',
    viewCourses: '直属“{name}”的课程',
    viewAdmins: '“{name}”的管理员',
    more: '可对“{name}”进行的操作',
    empty: '你没有管理任何部门。',
    notHere: {
      here: '当前所在位置',
      tooDeep: '连同其下部门会超过层数上限',
      nameTaken: '该处已有同名部门',
    },
  },

  admins: {
    title: '“{name}”的管理员',
    intro:
      '他们在管理页面管理此部门及其下属部门的所有课程，与平台管理员一样：创建、修改、启用、归档及移动这些课程，并指派讲师；也可在其下创建部门，并为其下的部门改名、移动及任命管理员。任命不会给予任何课程的席位：如需在课程之内工作，须像其他人一样先为自己指派席位。',
    here: '在此任命',
    above: '经由“{dept}”',
    appointedBy: '由 {name} 于 {date} 任命',
    removedBy: '由 {name} 于 {date} 结束',
    ended: '已结束',
    none: '此部门尚未任命管理员。',
    add: '任命管理员',
    addHint: '请以对方完整的邮箱地址查找。只有人员可以被任命，智能体不可以；也不能任命自己。',
    appoint: '任命 {name}',
    remove: '结束任命',
    removeTitle: '要结束 {name} 的任命吗？',
    removeConfirm: '{name} 会立即停止管理“{dept}”，其做过的操作会保留记录。若对方也经由上级部门管理此部门，该管理权保持不变。',
    added: '已任命 {name}',
    removed: '已结束 {name} 的任命',
    cannotHere: '此部门的管理员由其上级部门的管理员任命。',
    cannotTop: '顶层部门的管理员由平台管理员任命。',
    showRemoved: '显示过往任命',
    coveredAbove: '{name} 已经由上级部门管理此部门；若该项任命结束，这项任命可让对方继续管理。',
    blocked: {
      self: '不能任命自己。',
      agent: '只有人员可以管理部门，智能体不可以。',
      suspended: '此账号已被停用，不能被任命。',
      already: '对方已是此部门的管理员。',
    },
  },

  lookup: {
    email: '邮箱或学号／工号',
    placeholder: "name{'@'}example.edu",
    hint: '请输入对方完整的邮箱地址，或完整的学号／工号，不支持部分搜索。',
    invalid: "请输入完整的邮箱地址（例如 name{'@'}example.edu），或完整的学号／工号。",
    notFoundLoginId: '没有人用此学号／工号注册。要邀请新成员，请用对方的邮箱查找。',
    find: '查找',
    notFound: '没有人用此邮箱注册。你可以邀请对方。',
    notFoundPlain: '没有人用此邮箱注册。',
    suspended: '此账号已被停用。',
    notSignedIn: '尚未登录过。',
    invitePending: '已邀请，{date} 前有效',
    inviteExpired: '邀请已于 {date} 过期',
  },

  invite: {
    new: '邀请新人员',
    title: '邀请新人员',
    intro: '系统会为对方注册，并生成让对方设置密码的链接。请自行把链接交给对方：AIshie 不会发送邮件。',
    name: '姓名',
    namePlaceholder: '陈大文',
    email: '邮箱',
    submit: '注册并邀请',
    again: '再次邀请',
    againHint: '对方尚未登录过。新链接会取代先前给对方的链接。',
    seatThem: '指派 {name} 为讲师',
    emailTaken: '此邮箱已有人注册，请改为指派该人员。',
    done: '已注册并邀请 {name}',
  },

  courses: {
    subtitle: '你所管理的部门及其下属部门的课程',
    within: '包括下属部门',
    noTerms: '尚未创建任何学期。学期由平台管理员创建。',
  },

  course: {
    move: '移动到其他部门',
    moveTitle: '移动 {code}',
    moveIntro:
      '成员、他们的席位及课程内的一切都保持不变。管理权随所属部门改变：原部门的管理员若不管理新部门，会立即失去管理权。',
    moveTo: '部门',
    moved: '已移动到“{dept}”',
    notSeated:
      '你没有加入此课程，因此课程本身的页面会拒绝你：管理员在此管理课程，而不是从课程内部操作。如需在课程内工作，请在下方将自己指派为讲师。',
  },

  home: {
    explain:
      '管理部门的身份不会让你进入其课程：每个人在课程里看到什么，取决于他在该课程的席位。要打开这些课程，请到课程的管理页指派讲师，或指派你自己。',
  },

  noSeat: {
    body: '管理其所属部门的身份不会让你进入课程：每个人在课程里看到什么，取决于他在该课程的席位。请到这门课程的管理页指派讲师，或指派你自己。',
  },

  // 按 Core 给出的原因（details.reason）说明拒绝。
  errors: {
    department_out_of_scope: '这不在你所管理的部门范围内。',
    destination_out_of_scope: '只能移动到你所管理的部门；顶层由平台管理员负责。',
    name_taken: '该处已有同名的部门。',
    same_name: '它已经是这个名称。',
    too_deep: '这会使部门超过 {max_depth} 层。',
    cycle: '部门不能移动到自身或其下属部门之下。',
    same_parent: '它已经在那里。',
    same_department: '课程已属于该部门。',
    not_a_person: '只有人员可以管理部门，智能体不可以。',
    actor_suspended: '该账号已被停用。',
    self_appointment: '不能任命自己。',
    already_admin: '对方已是此部门的管理员。',
    not_admin: '对方不是此部门的管理员。',
    email_taken: '此邮箱已有人注册，请改为指派该人员。',
    invite_not_allowed:
      '只有在对方从未登录、而且在你所管理的部门以外没有任何席位或权限时，你才可以再次邀请对方。请向平台管理员求助。',
    // 部门管理员邀请时，actor.invite 拒绝的原因（details.why）。
    inviteWhy: {
      signed_in: '对方曾经登录，新的邀请会取代其密码。只有平台管理员可以这样做：如对方忘记了密码，请向平台管理员求助。',
      platform_role: '对方是平台管理员，只有其他平台管理员可以邀请对方。',
      not_a_person: '这是智能体，不是人员：智能体使用 API 令牌，而不是邀请链接。',
      administers: '对方本身是部门管理员，只有平台管理员可以邀请对方。',
      owns_agents: '对方拥有智能体，邀请链接会连同这些智能体一并交出，因此只有平台管理员可以邀请对方。',
      seated_elsewhere: '对方在你所管理的部门以外的课程有席位，只有平台管理员可以邀请对方。',
    },
  },
}
