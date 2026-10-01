// Object URLs (blob:) the viewer shows a file's bytes from: an image, a
// recording. The page's policy lets images come from blob: (index.html),
// where a download URL may be an object store's, another origin; and a blob
// holds the bytes for as long as its URL lives, so each is revoked as soon
// as it is no longer shown: another file shown, the viewer closed.

/** The object URLs made for what is on screen, revoked together. */
export class ObjectUrls {
  #urls = new Set<string>()

  /** An object URL of the bytes, kept until revoked. */
  make(blob: Blob): string {
    const url = URL.createObjectURL(blob)
    this.#urls.add(url)
    return url
  }

  /** Revokes one. */
  revoke(url: string | null | undefined) {
    if (!url || !this.#urls.delete(url)) return
    URL.revokeObjectURL(url)
  }

  /** Revokes every one made and not yet revoked. */
  revokeAll() {
    for (const url of this.#urls) URL.revokeObjectURL(url)
    this.#urls.clear()
  }

  /** How many are live. */
  get size(): number {
    return this.#urls.size
  }
}
