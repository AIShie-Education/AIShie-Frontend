// The letters an agent's avatar shows (AgentAvatar), from its name.
//
// Two letters from a name in a Latin script, as aishie.app's queue shows
// them ("Course TA agent" → CT, "Grader" → GR, "grader-v2" → GV); one
// character from a name that starts in Chinese, Japanese or Korean, which is
// as wide as two letters and reads as the name's start ("小明的溫習助手" →
// 小). A course code in front of a Chinese name is what reads ("CS101
// 課程助手" → CS). Nothing for an empty name: the avatar shows the agents'
// icon then.

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
/** What separates a name's words, besides spaces: dashes, dots, brackets, quotes. */
const SEPARATORS = /[\s\-_.,/\\·・•()（）「」『』[\]{}<>《》"'“”‘’:：;；!！?？]+/u

const firstChar = (s: string) => Array.from(s)[0] ?? ''
const wide = (s: string) => WIDE.test(firstChar(s))
/** Letters and digits only: what may start a word's initial. */
const letters = (s: string) => Array.from(s).filter((c) => /[\p{L}\p{N}]/u.test(c))

export function agentInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .trim()
    .split(SEPARATORS)
    .filter((w) => letters(w).length)
  if (!words.length) return ''
  if (wide(words[0])) return letters(words[0])[0]
  const latin = words.filter((w) => !wide(w))
  if (latin.length >= 2) return (letters(latin[0])[0] + letters(latin[1])[0]).toLocaleUpperCase()
  return letters(latin[0]).slice(0, 2).join('').toLocaleUpperCase()
}

/**
 * A name split before its last character, so that what follows the name
 * (its "AI", AgentName) can be kept on the line of that character: the head
 * may wrap, the end never parts from what follows. Only the last letter or
 * digit, with whatever punctuation closes the name after it: a last word in
 * a Latin script is not broken where it would not be anyway (between its
 * letters), so it still goes to the line of the "AI" whole; Chinese,
 * Japanese and Korean break between any two characters; and a long name with
 * no spaces ("cs101-introduction-to-programming-weekly-revision-tutor") still
 * breaks wherever it must, rather than running out of its row with its "AI".
 */
export function splitNameEnd(name: string | null | undefined): { head: string; end: string } {
  const s = (name ?? '').trimEnd()
  const m = /[\p{L}\p{N}]\p{M}*[^\p{L}\p{N}]*$/u.exec(s)
  if (m) return { head: s.slice(0, m.index), end: s.slice(m.index) }
  const chars = Array.from(s)
  return { head: chars.slice(0, -1).join(''), end: chars.slice(-1).join('') }
}
