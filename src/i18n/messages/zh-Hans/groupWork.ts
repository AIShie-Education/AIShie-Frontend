// 小组作业（由各小组提交的作业，AIShie-Core #74）：作业的表单和页面、学生以小组身份做的作业、
// 小组的提交，以及按小组列出的名单。
export default {
  // 作业的属性：由各小组提交。
  tag: '小组作业',
  /** 名单中代表读者本人的称呼（“王健和你”）。 */
  you: '你',
  /** 句首的读者本人。 */
  youStart: '你',
  /** 页面无法向读者说出名字的成员，用于句中。 */
  someone: '一位成员',
  states: {
    // 学生不属于作业所用分组中的任何小组（名单上的状态）。
    no_group: '未分组',
  },
  form: {
    label: '小组作业',
    toggle: '每个小组为全体组员提交一份作业',
    set: '分组',
    setPlaceholder: '选择分组',
    setRequired: '请选择由哪个分组的小组提交',
    groups: '{n}个小组',
    archived: '已归档',
    hint: '分组中的每个小组为组员提交一份作业；不属于任何小组的学生无法提交。是否为小组作业、使用哪个分组，只能在有人开始做之前修改。',
    locked: '已有人开始做这份作业，是否为小组作业及使用哪个分组已不能再修改。',
    noSets: '这个课程还没有分组。',
    makeSet: '到“小组”页创建分组',
    unreadable: '暂时无法读取课程的分组，因此不能在这里设置小组作业。',
  },
  // 与小组作业有关的拒绝原因，按原因说明。
  refusal: {
    assignment_has_work:
      '已有人开始做这份作业（草稿、已提交的作业或缺交记录），是否为小组作业及使用哪个分组已不能再修改。',
    set_archived: '该分组已归档。请选择另一个分组，或先将它恢复。',
    no_group:
      '你不属于这份作业所用分组中的任何小组，所以暂时没有可以开始的作业。请在报名开放期间报名加入小组，或请老师把你分到小组中。',
    group_assignment: '这是小组作业：要记录为缺交的是小组，而不是单个学生。',
    group_empty: '这个小组没有组员，无法为它记录作业。',
    members_changed: '页面读取后，你的小组组员已有变动。请先确认现在是为哪些组员提交，然后再提交一次。',
    draft_changed: '你开始编辑后，小组里有人修改了草稿。请加载草稿现在的内容，或保留你的文字并用它覆盖。',
    not_a_group_assignment: '这份作业不是小组作业。',
  },
  // 作业页。
  page: {
    set: '分组',
    myGroup: '你的小组',
    noGroup: '还没有分组',
  },
  // 学生以小组身份做的作业（作业页）。
  work: {
    group: '你的小组',
    members: '组员',
    noGroupTitle: '你还没有加入任何小组',
    noGroupBody:
      '这是小组作业：“{set}”中的每个小组为组员提交一份作业。你不属于其中任何小组，所以没有可以开始或提交的作业。',
    noGroupBodyNoSet: '这是小组作业：每个小组为组员提交一份作业。你还没有加入任何小组，所以没有可以开始或提交的作业。',
    signupUntil: '报名开放至{closes}：请选择要加入的小组。',
    signupOpen: '报名已开放：请选择要加入的小组。',
    signupWhere: '可在课程的“小组”页加入小组。',
    askTeacher: '报名尚未开放。请老师把你分到小组中。',
    chooseGroup: '选择小组',
    noGroupNow: '你之前与小组提交过的作业列在下方。',
    start: '开始小组草稿',
    startHint: '你的小组共用一份草稿：每位组员都可以修改，任何一位组员都可以代表小组提交。',
    alreadyStarted: '小组已有人开始了草稿，草稿如下。',
    text: '小组的答案',
    revised: '{name}最后修改于{when}',
    conflictTitle: '你编辑期间，{name}于{when}修改了草稿',
    conflictBody: '你可以加载草稿现在的内容（会丢弃你在这里的修改），或继续编辑你的版本：保存后会替换对方写的内容。',
    conflictLoading: '正在读取草稿现在的内容…',
    showTheirs: '草稿现在的内容',
    loadTheirs: '加载现在的内容',
    keepMine: '继续编辑我的版本',
    resolveFirst: '请先加载草稿现在的内容，或选择继续编辑你的版本。',
    handedInByOther: '{name}已提交草稿。',
    handedInByOtherUnsaved: '{name}已提交草稿，其中不包括你未保存的修改。这些修改保留在下方，可供你复制。',
    // 草稿打开期间，学生被调离小组（或分组）。
    notInGroupNow: '你已不在{group}，因此不能再修改或提交它的草稿。',
    notInGroupNowUnnamed: '你已不在这份草稿所属的小组，因此不能再修改或提交它。',
    // 学生在小组草稿中输入但未保存的内容，而草稿已不再属于他们。
    keptTitle: '你未保存的内容',
    keptHint: '这些内容不在任何草稿中，只会保留在这个页面，直到你丢弃为止。如要再用，请先复制。',
    keptCopyFailed: '无法自动复制。请自行选取文字并复制。',
    keptDiscard: '丢弃',
    keptDiscardTitle: '要丢弃你未保存的内容吗？',
    keptDiscardBody: '这些内容没有保存在其他地方，丢弃后无法恢复。',
    changedBeforeHandIn: '提交前草稿已有变动：{name}于{when}修改了它。请重新阅读后再提交。',
    filesChangedBeforeHandIn: '提交前草稿的文件已有变动：有组员附加或移除了文件。请先检查文件，再提交。',
    handInTitle: '要为{group}提交第{n}次作答吗？',
    handInFor: '这份作业会为{names}提交：提交后就是他们的作业，之后小组有任何变动也不会改变。',
    handInLeftOutMe: '你不会包括在内：你已是{group}这份作业的成员。',
    handInFixed: '提交后便不能再修改；如之后要更改，小组需要开始新一次提交。',
    handedInFor: '已为{names}提交。',
    handedInForLate: '已为{names}提交，并标记为迟交。',
    leftOutMe: '你没有包括在内：你已是另一个小组这份作业的成员。老师可以修改这份作业属于哪些人。',
    leftOut: '{names}没有包括在内：他们已是另一个小组这份作业的成员。老师可以修改这份作业属于哪些人。',
    notPartNow:
      '你这份作业的成果，是你与{group}一起提交的那份。你的小组现在提交的作业不会包括你；老师可以修改作业属于哪些人。',
    handedInBy: '由{name}提交',
    forMembers: '组员：{names}',
    recordedFor: '为{names}记录为缺交',
  },
  // 作业名单（按小组）。
  roster: {
    view: '显示',
    byGroup: '按小组',
    byStudent: '按学生',
    chipsLabel: '按作业进度划分的小组',
    group: '小组',
    members: '现在的组员',
    handedIn: '提交',
    handedInFor: '为{names}提交',
    missingFor: '为{names}记录为缺交',
    workOf: '{group}的作业',
    workOfAnother: '另一个小组的作业',
    nobody: '没有组员',
    handedInBy: '由{name}提交',
    empty: '这个分组还没有小组。',
    emptyStudent: '这位学生不属于这里列出的任何小组。',
    noGroupTitle: '未分组：{n}位学生',
    noGroupNote: '他们无法提交这份作业，也不会被记录为缺交。请把他们分别分到分组中的小组：一人一组也可以。',
    noGroupMore: '尚未加载的页面可能还有其他学生。',
    // 小组组员下方，给只涵盖部分学生的席位：席位未涵盖的组员人数。
    unreached: '另有{n}位组员不在你的席位涵盖范围内',
    // 同上，并说明因此不能在这里把小组记录为缺交：须涵盖全部组员。
    unreachedMissing: '另有{n}位组员不在你的席位涵盖范围内，因此须由席位涵盖全部组员的人把小组记录为缺交',
    openSet: '打开分组',
    recordMissing: '记录为缺交',
    confirmTitle: '要把{group}记录为缺交吗？',
    confirmBody:
      '{group}会被记录为没有提交“{assignment}”，记录属于现在的组员：{names}。之后便可以评分。如小组之后提交作业，作业会替换这条记录。',
    confirmBodyFor:
      '{group}会被记录为没有提交“{assignment}”，记录属于{names}。之后便可以评分。如小组之后提交作业，作业会替换这条记录。',
    confirmLeftOut: '{names}不包括在内：他们已是另一个小组这份作业的成员。',
    otherWorkSome: '{names}已是另一个小组这份作业的成员，因此把小组记录为缺交时不包括他们',
    otherWorkAll: '{names}已是另一个小组这份作业的成员，因此此小组没有组员可记录为缺交',
    done: '已把{group}记录为缺交。',
    noGroupCell: '无',
  },
  // 提交列表。
  list: {
    whose: '作业属于',
  },
}
