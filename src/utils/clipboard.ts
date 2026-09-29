// Copying text for the reader, where the browser lets a page: the Clipboard
// API in a secure context, else the older execCommand through a hidden
// field. Resolves to whether it was copied; the text stays selectable on the
// page either way.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* refused: try the older way */
  }
  if (typeof document === 'undefined') return false
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  field.style.pointerEvents = 'none'
  const active = document.activeElement as HTMLElement | null
  document.body.appendChild(field)
  field.select()
  let ok = false
  try {
    ok = typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    ok = false
  }
  field.remove()
  active?.focus?.()
  return ok
}
