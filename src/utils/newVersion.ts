// Whether a newer build of the app has been deployed than the one this tab
// runs. A tab left open keeps running the JavaScript it loaded; index.html
// is served with no-cache, and names the build's entry script by its hash
// (assets/index-<hash>.js), so reading it again says which build is live.

/** The entry script a page of the app names: its path, from /assets/index-…js, or null. */
export function entryScriptOf(html: string): string | null {
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = m[0]
    if (!/\btype=["']?module["']?/i.test(tag)) continue
    const src = /\bsrc=["']?([^"'\s>]+)/i.exec(tag)?.[1]
    const entry = src && normalEntry(src)
    if (entry) return entry
  }
  return null
}

/** An entry script's path, as /assets/index-<hash>.js, whatever origin or base it was written with; else null. */
export function normalEntry(src: string): string | null {
  let path = src
  try {
    path = new URL(src, 'http://x.invalid/').pathname
  } catch {
    return null
  }
  const m = /\/assets\/index-[^/]+\.js$/.exec(path)
  return m ? m[0] : null
}

/** The entry script this page loaded, as its document names it; null in development (no hashed entry). */
export function loadedEntry(doc: Document | undefined = typeof document === 'undefined' ? undefined : document) {
  if (!doc) return null
  for (const s of doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')) {
    const entry = normalEntry(s.getAttribute('src') ?? '')
    if (entry) return entry
  }
  return null
}

/**
 * The entry script the live index.html names (read with no cache at all), or
 * null when it could not be read or names none: a failed check is no news.
 */
export async function liveEntry(fetchImpl: typeof fetch = fetch, url = '/'): Promise<string | null> {
  try {
    const res = await fetchImpl(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    })
    if (!res.ok) return null
    return entryScriptOf(await res.text())
  } catch {
    return null
  }
}
