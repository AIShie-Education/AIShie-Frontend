import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { fakeContainerWidths } from './containerWidthFakes'
import { useContainerNarrow, useContainerWidth } from './useContainerWidth'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Runs the composable inside a scope that can be torn down, as a component's is. */
function inScope<T>(make: () => T) {
  const scope = effectScope()
  const out = scope.run(make)!
  return { out, dispose: () => scope.stop() }
}

function element(className: string) {
  const el = document.createElement('div')
  el.className = className
  document.body.append(el)
  return el
}

describe('useContainerWidth', () => {
  it('knows no width where there is no ResizeObserver, and a narrow test is then false', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const target = ref<Element | null>(element('page'))
    const { out } = inScope(() => ({ width: useContainerWidth(target), narrow: useContainerNarrow(target, 600) }))
    await nextTick()
    expect(out.width.value).toBeNull()
    expect(out.narrow.value).toBe(false)
  })

  it('follows the element’s width once it is there, and as it changes', async () => {
    const sizes = fakeContainerWidths({ '.page': 924 })
    const target = ref<Element | null>(null)
    const { out } = inScope(() => useContainerWidth(target))
    expect(out.value).toBeNull()
    target.value = element('page')
    await nextTick()
    expect(out.value).toBe(924)
    await sizes.resize('.page', 644)
    expect(out.value).toBe(644)
  })

  it('forgets the width of an element that has gone, and observes the next one alone', async () => {
    const sizes = fakeContainerWidths({ '.a': 500, '.b': 800 })
    const [a, b] = [element('a'), element('b')]
    const target = ref<Element | null>(a)
    const { out } = inScope(() => useContainerWidth(target))
    await nextTick()
    expect(out.value).toBe(500)
    target.value = null
    await nextTick()
    expect(out.value).toBeNull()
    target.value = b
    await nextTick()
    expect(out.value).toBe(800)
    // The one before is not observed any more.
    await sizes.resize('.a', 300)
    expect(out.value).toBe(800)
  })

  it('follows a change it is told of once that task is over, and the window’s resizing at once', async () => {
    // An observer of its own, to tell it of a change and look before the task it was told in is over.
    let tell: ResizeObserverCallback = () => undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          tell = callback
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const el = element('page')
    let laidOut = 924
    el.getBoundingClientRect = () => ({ width: laidOut }) as DOMRect
    const told = (width: number) =>
      tell(
        [{ target: el, contentRect: { width } as DOMRectReadOnly } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      )
    const { out } = inScope(() => useContainerWidth(ref(el)))
    await nextTick()
    // Measured before the first paint.
    expect(out.value).toBe(924)

    // The side bar opened: an el-table in the page lays itself out from its own observer in this task, so the page
    // follows in the next one, at the last width it was told.
    told(700)
    told(644)
    expect(out.value).toBe(924)
    await new Promise((done) => setTimeout(done))
    expect(out.value).toBe(644)

    // The window resized: followed at once, before the browser lays the page out, and what was still to come is not.
    told(500)
    laidOut = 1000
    window.dispatchEvent(new Event('resize'))
    expect(out.value).toBe(1000)
    await new Promise((done) => setTimeout(done))
    expect(out.value).toBe(1000)
  })

  it('stops observing with its scope', async () => {
    const sizes = fakeContainerWidths({ '.page': 924 })
    const { out, dispose } = inScope(() => useContainerWidth(ref(element('page'))))
    await nextTick()
    dispose()
    await sizes.resize('.page', 400)
    expect(out.value).toBe(924)
  })
})

describe('useContainerNarrow', () => {
  it('is narrow at the width given and below, as @container (max-width) is', async () => {
    const sizes = fakeContainerWidths({ '.page': 720 })
    const limit = ref(719)
    const { out } = inScope(() => useContainerNarrow(ref(element('page')), limit))
    await nextTick()
    expect(out.value).toBe(false)
    await sizes.resize('.page', 719.5)
    expect(out.value).toBe(false)
    await sizes.resize('.page', 719)
    expect(out.value).toBe(true)
    // The limit may move (it may depend on who is looking).
    limit.value = 599
    expect(out.value).toBe(false)
  })
})
