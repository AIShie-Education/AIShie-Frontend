// For unit tests only (imported by *.spec.ts): jsdom lays nothing out and has
// no ResizeObserver, so useContainerWidth knows no width there and a page
// shows its wide layout. fakeContainerWidths stands a ResizeObserver in that
// gives the elements a selector matches the width given (their content box),
// as a browser would have laid them out; every other element it observes is
// never sized, as without one. resize() changes a width afterwards, tells
// whoever observes those elements, and waits for useContainerWidth to follow
// (once what told it is over).
import { vi } from 'vitest'

export function fakeContainerWidths(widths: Record<string, number>) {
  const live = new Set<FakeResizeObserver>()
  const widthOf = (el: Element) => {
    for (const [selector, width] of Object.entries(widths)) if (el.matches(selector)) return width
    return undefined
  }
  class FakeResizeObserver {
    private readonly watched = new Set<Element>()
    constructor(private readonly callback: ResizeObserverCallback) {
      live.add(this)
    }
    observe(el: Element) {
      this.watched.add(el)
      this.tell(el)
    }
    unobserve(el: Element) {
      this.watched.delete(el)
    }
    disconnect() {
      this.watched.clear()
      live.delete(this)
    }
    tell(el: Element) {
      const width = widthOf(el)
      if (width === undefined) return
      const contentRect = { x: 0, y: 0, top: 0, left: 0, width, height: 0, right: width, bottom: 0 } as DOMRectReadOnly
      this.callback([{ target: el, contentRect } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    retell(selector: string) {
      for (const el of this.watched) if (el.matches(selector)) this.tell(el)
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return {
    async resize(selector: string, width: number) {
      widths[selector] = width
      for (const o of live) o.retell(selector)
      await new Promise((done) => setTimeout(done))
    },
  }
}
