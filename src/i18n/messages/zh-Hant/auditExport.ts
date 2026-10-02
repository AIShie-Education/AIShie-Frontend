// 匯出對話作稽核：匯出對話的管理頁面（conversation.export），以及再次取得其檔案（conversation.export_file）。
export default {
  title: '匯出對話',
  subtitle: '匯出對話作稽核，檔案為 JSON Lines 及 CSV：可匯出一門課程、一個部門或整個網站的對話。',
  subtitleDept: '匯出對話作稽核，檔案為 JSON Lines 及 CSV：限於你所管理的課程或部門。',

  form: {
    title: '匯出甚麼',
    intro:
      '匯出內容包括所選對話的每則訊息（已撤回的訊息連同原文，並標示為已撤回）；每則訊息所附檔案的說明（不含檔案本身）；以及曾經提出但從未發佈的回答與提問。每次匯出都會留下紀錄：匯出者、時間及所選範圍。',
    scope: '對話範圍',
    course: '課程',
    department: '部門',
    departmentPlaceholder: '選擇部門',
    departmentHint: '包括該部門及其下所有部門的課程。',
    siteHint: '網站上所有課程的所有對話。',
    participant: '參與者（選填）',
    participantHint: '只匯出此人提問、或此代理回答的對話。可按姓名、電子郵件或學號／工號搜尋，或貼上其 ID。',
    participantHintDept: '只匯出此人提問、或此代理回答的對話。人員請輸入完整的電子郵件或學號／工號；代理請貼上其 ID。',
    from: '開始日期（選填）',
    to: '截至並包括（選填）',
    anyStart: '不限開始',
    anyEnd: '直至現在',
    zone: '日期按你的日曆計算，時區為{zone}（UTC{offset}）：由首日零時起，至最後一日完結為止。',
    zoneOffset: '日期按你的日曆計算（UTC{offset}）：由首日零時起，至最後一日完結為止。',
    sent: '實際傳送',
    submit: '匯出',
    exporting: '匯出中…',
  },

  scope: {
    course: '一門課程',
    department: '一個部門',
    site: '整個網站',
  },

  span: {
    all: '不限時間，所有寫入的內容。',
    from: '{from}起寫入的內容。',
    to: '截至並包括{to}寫入的內容。',
    both: '{from}起，截至並包括{to}寫入的內容。',
  },

  problem: {
    course: '請選擇課程。',
    department: '請選擇部門。',
    dates: '最後一日早於首日。',
  },

  pending: {
    title: '於{time}提出的匯出未有回應',
    body: '表單已還原當時的選擇。再次匯出即可取得：伺服器會交回已完成的匯出，不會重複匯出。',
    discard: '重新開始',
  },

  running: {
    title: '正在匯出',
    elapsed: '已進行{time}。',
    note: '大型匯出可能需時數分鐘。期間你可以前往其他頁面再回來：匯出會繼續進行，結果會在此顯示。如連線中斷，請以相同選擇再次匯出：伺服器會交回已完成的匯出，不會重複匯出。',
  },

  outcome: {
    title: '已匯出',
    replayed: '再次取得',
    recorded: '已記錄為操作{id}：匯出者、時間及所選範圍。',
  },

  privacy: {
    title: '這些檔案包含個人資料',
    body: '檔案包含各人所寫的內容（包括已撤回的訊息）及其姓名。請只在所屬機構規定容許的地方保存，切勿交給不應閱讀的人。每條下載連結約 15 分鐘內有效，需要時本頁會取得新連結。檔案會於{time}從伺服器刪除，之後無法再下載。',
  },

  refused: {
    title: '未能匯出',
    noAnswer: '伺服器沒有回應',
    noAnswerBody: '匯出可能仍在進行，或已經完成。請以相同選擇再次匯出：伺服器會交回已完成的匯出，不會重複匯出。',
  },

  tooLarge: {
    course: '改為匯出一門課程，而非一個部門或整個網站。',
    participant: '只匯出一位參與者的對話。',
    days: '縮短日期範圍。',
  },

  refusal: {
    export_too_large:
      '此匯出將包含{conversations}段對話中的{messages}則訊息及{text}文字，超出上限（{maxMessages}則訊息、{maxText}）。請縮小範圍：',
    department_out_of_scope: '該課程或部門不在（或已不在）你所管理的部門之內。請選擇你獲委任的部門或其下的課程或部門。',
    platform_role_required:
      '只有網站管理員可以匯出對話；部門管理員只可匯出其部門的課程，並須指定所管理的課程或部門。整個網站須由平台管理員匯出。',
    people_only: '對話須由人員匯出，並由其負責：代理不可匯出任何對話。',
    export_expired: '此匯出的檔案已被刪除（每次匯出的檔案都會在一段時間後刪除）。請重新匯出。',
    no_file_storage: '此伺服器沒有檔案儲存，因此無法匯出。伺服器營運者可設定檔案儲存。',
    notFound: '所選的課程、部門或參與者不存在，或已不存在。',
    fileNotFound: '此匯出不屬於你，或已不存在。',
    proposed: '伺服器沒有即時進行匯出，因此並未匯出任何內容。',
  },

  recent: {
    title: '最近的匯出',
    note: '你在此瀏覽器所作、檔案仍然保留的匯出，可再次下載。檔案包含個人資料；每條連結約 15 分鐘內有效。',
    forget: '從清單移除',
    gone: '該匯出的檔案已被刪除，已從清單移除。',
  },

  files: {
    format: {
      jsonl: 'JSON Lines',
      csv: 'CSV',
    },
    about: {
      jsonl: '每行一段對話，連同其訊息及提案：供程式讀取。',
      csv: '每列一則訊息，已撤回的會標示：可用試算表開啟，中文亦能正確顯示。',
    },
    checksum: '校驗碼',
    download: '下載{format}',
    linksLive: '下載連結仍有{time}有效。',
    linksExpired: '下載連結已過期。',
    linksNone: '每次下載都會向伺服器取得新連結。',
    refresh: '取得新連結',
    deleted: '檔案已從伺服器刪除。',
  },

  summary: {
    site: '整個網站',
    scoped: '{kind}：{label}',
    participant: '參與者：{who}',
    conversations: '對話',
    messages: '訊息',
    withdrawn: '其中{n}則已撤回',
    proposals: '從未發佈的提案',
    attachments: '附件（只有說明）',
    text: '文字',
    asOf: '匯出時間',
    expiresAt: '檔案刪除時間',
  },

  course: {
    placeholder: '按代碼或名稱搜尋課程，或貼上課程 ID',
    notFound: '你所管理的課程中沒有此 ID。',
    none: '沒有可選擇的課程。',
    noMatch: '沒有符合的課程。',
    typeMore: '只顯示首{n}項符合的結果：請輸入更多字以縮窄範圍。',
    pasteId: '只搜尋首{n}門課程：其後的課程請貼上其 ID。',
  },

  participant: {
    placeholder: '任何人：按姓名、電子郵件或學號搜尋人員或代理',
    placeholderId: '任何人：貼上人員或代理的 ID',
    pasteId: '請貼上其 ID。',
    noMatch: '沒有符合的人員或代理。',
    lookupPlaceholder: '完整的電子郵件、學號／工號，或 ID',
    find: '查找',
    invalid: '請輸入完整的電子郵件地址、完整的學號／工號，或 ID。',
    notFound: '沒有人以{who}登記。',
    byId: 'ID {id}',
    byIdShort: '按 ID',
    clear: '改為任何人',
  },
}
