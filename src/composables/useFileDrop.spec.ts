import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { filesFrom, installDropGuard, usePageDrop } from './useFileDrop'

const file = (name: string) => new File(['x'], name, { type: 'text/plain' })

/** A DataTransfer as the browser hands one to a drop (jsdom has none). */
function transfer(files: File[], folders: string[] = []) {
  const items = [
    ...files.map((f) => ({ kind: 'file', getAsFile: () => f, webkitGetAsEntry: () => ({ isDirectory: false }) })),
    ...folders.map(() => ({ kind: 'file', getAsFile: () => null, webkitGetAsEntry: () => ({ isDirectory: true }) })),
  ]
  return { types: ['Files'], files, items, dropEffect: 'none' } as unknown as DataTransfer
}

function fire(type: string, dt: DataTransfer, target: EventTarget = document.body, opts: { taken?: boolean } = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: dt })
  if (opts.taken) e.preventDefault()
  target.dispatchEvent(e)
  return e
}

const scopes: EffectScope[] = []
function taker(enabled = () => true) {
  const onFiles = vi.fn()
  const scope = effectScope()
  const out = scope.run(() => usePageDrop({ enabled, onFiles }))!
  scopes.push(scope)
  return { onFiles, dragging: out.dragging, stop: () => scope.stop() }
}

afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
})

describe('files dropped on the page', () => {
  it('are never opened by the browser, even where nothing takes them', () => {
    installDropGuard()
    const dt = transfer([file('a.pdf')])
    const over = fire('dragover', dt)
    expect(over.defaultPrevented).toBe(true)
    expect(dt.dropEffect).toBe('none')
    expect(fire('drop', dt).defaultPrevented).toBe(true)
  })

  it('go to what asked for them last, which alone is shown as where they will go', () => {
    const page = taker()
    const dialog = taker()
    const dt = transfer([file('a.pdf'), file('b.pdf')])
    fire('dragover', dt)
    expect(dt.dropEffect).toBe('copy')
    expect(dialog.dragging.value).toBe(true)
    expect(page.dragging.value).toBe(false)
    fire('drop', dt)
    expect(dialog.onFiles).toHaveBeenCalledWith([dt.files[0], dt.files[1]], 0)
    expect(page.onFiles).not.toHaveBeenCalled()
    expect(dialog.dragging.value).toBe(false)

    // Gone, it passes them back to the page.
    dialog.stop()
    fire('drop', transfer([file('c.pdf')]))
    expect(page.onFiles).toHaveBeenCalledTimes(1)
  })

  it('pass one that is turned off by for the one before', () => {
    const page = taker()
    let open = true
    const dialog = taker(() => open)
    open = false
    fire('drop', transfer([file('a.pdf')]))
    expect(dialog.onFiles).not.toHaveBeenCalled()
    expect(page.onFiles).toHaveBeenCalledTimes(1)
  })

  it('are not taken again where a zone under them took them', () => {
    const page = taker()
    const dt = transfer([file('a.pdf')])
    fire('dragover', dt, document.body, { taken: true })
    expect(dt.dropEffect).toBe('none')
    fire('drop', dt, document.body, { taken: true })
    expect(page.onFiles).not.toHaveBeenCalled()
  })

  it('stop being shown when the drag leaves the window, or dies out', () => {
    vi.useFakeTimers()
    const page = taker()
    const dt = transfer([file('a.pdf')])
    fire('dragover', dt)
    expect(page.dragging.value).toBe(true)
    fire('dragleave', dt)
    expect(page.dragging.value).toBe(false)
    fire('dragover', dt)
    vi.advanceTimersByTime(1_000)
    expect(page.dragging.value).toBe(false)
  })

  it('say how many were folders, which are not taken', () => {
    const page = taker()
    fire('drop', transfer([file('a.pdf')], ['Week 3']))
    expect(page.onFiles).toHaveBeenCalledWith([expect.any(File)], 1)
  })
})

describe('files pasted', () => {
  it('go to what takes files, unless pasted into a field', () => {
    const page = taker()
    const dt = transfer([file('shot.png')])
    const e = fire('paste', dt)
    expect(e.defaultPrevented).toBe(true)
    expect(page.onFiles).toHaveBeenCalledTimes(1)

    const input = document.createElement('textarea')
    document.body.appendChild(input)
    fire('paste', dt, input)
    expect(page.onFiles).toHaveBeenCalledTimes(1)
    input.remove()
  })
})

describe('filesFrom', () => {
  it('takes the files of a transfer that has no items', () => {
    const f = file('a.pdf')
    expect(filesFrom({ files: [f] } as unknown as DataTransfer)).toEqual({ files: [f], folders: 0 })
    expect(filesFrom(null)).toEqual({ files: [], folders: 0 })
  })
})
