import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en/groups'
import zhHant from '@/i18n/messages/zh-Hant/groups'
import zhHans from '@/i18n/messages/zh-Hans/groups'

describe('the split note shown without a full preview', () => {
  it('promises only the groups the page shows, never a list of placed students', () => {
    expect(en.split.unseenAfter).toBe('Once it is made, this page lists the groups it made and those it left alone.')
    expect(zhHant.split.unseenAfter).toBe('分組完成後，此頁會列出新增了哪些小組，以及哪些小組保持不變。')
    expect(zhHans.split.unseenAfter).toBe('分组完成后，此页会列出新建了哪些小组，以及哪些小组保持不变。')
    for (const messages of [en, zhHant, zhHans]) {
      expect(messages.split.unseenAfter).not.toMatch(/whom it placed|分配了哪些學生|分配了哪些学生/)
    }
  })
})
