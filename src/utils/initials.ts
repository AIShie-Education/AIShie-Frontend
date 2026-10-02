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
 * A name split before its last word, so that what follows the name (its
 * "AI", AgentName) can be kept on the line of that word: the head may wrap,
 * the end never parts from what follows. The last word of a name in a
 * Latin script; the last character of one in Chinese, Japanese or Korean,
 * which breaks between any two characters.
 */
export function splitNameEnd(name: string | null | undefined): { head: string; end: string } {
  const s = (name ?? '').trimEnd()
  const at = s.search(/\S+$/u)
  if (at < 0) return { head: '', end: s }
  const word = s.slice(at)
  if (!WIDE.test(word)) return { head: s.slice(0, at), end: word }
  const chars = Array.from(word)
  const last = chars[chars.length - 1]
  // Closing punctuation after the last wide character stays with it.
  const k = WIDE.test(last) ? 1 : Math.min(2, chars.length)
  return { head: s.slice(0, at) + chars.slice(0, -k).join(''), end: chars.slice(-k).join('') }
}
