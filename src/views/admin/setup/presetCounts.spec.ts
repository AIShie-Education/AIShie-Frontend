import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

// Each preset.list waits until the test answers it.
interface Call {
  dept: string
  signal?: AbortSignal
  answered?: boolean
  answer: (own: number) => void
  fail: () => void
}
let calls: Call[] = []
let running = 0
let mostAtOnce = 0
vi.mock('@/api/http', async (orig) => {
  const real = await orig<typeof import('@/api/http')>()
  return {
    ...real,
    read: vi.fn((tool: string, args: { dept_id: string }, opts: { signal?: AbortSignal } = {}) => {
      if (tool !== 'preset.list') return Promise.reject(new Error(`no answer for ${tool}`))
      running++
      mostAtOnce = Math.max(mostAtOnce, running)
      return new Promise((resolve, reject) => {
        const done = () => running--
        calls.push({
          dept: args.dept_id,
          signal: opts.signal,
          // The six built-ins, and the department's own.
          answer: (own) => {
            done()
            const builtIns = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, dept_id: null }))
            const mine = Array.from({ length: own }, (_, i) => ({ id: `${args.dept_id}-${i}`, dept_id: args.dept_id }))
            resolve({ presets: [...builtIns, ...mine] })
          },
          fail: () => {
            done()
            reject(new real.ApiError({ status: 429, code: 'rate_limited', message: 'too many calls' }))
          },
        })
      })
    }),
  }
})

const { usePresetCounts } = await import('./presetCounts')

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `d${from + i}`)
const tick = () => new Promise((r) => setTimeout(r, 0))
/** Answers every call waiting, and those they lead to, until none is left. */
async function answerAll(own = (dept: string) => Number(dept.slice(1)) % 3) {
  for (let c = calls.find((x) => !x.answered); c; c = calls.find((x) => !x.answered)) {
    c.answered = true
    c.answer(own(c.dept))
    await tick()
  }
}
function page() {
  const scope = effectScope()
  const counts = scope.run(() => usePresetCounts())!
  return { ...counts, leave: () => scope.stop() }
}

beforeEach(() => {
  calls = []
  running = 0
  mostAtOnce = 0
})

describe('usePresetCounts', () => {
  it('counts only the department’s own presets, four at a time, at most 60 a visit', async () => {
    const { counts, count } = page()
    const done = count(ids(150))
    await tick()
    expect(calls).toHaveLength(4)
    await answerAll()
    await done
    expect(calls).toHaveLength(60)
    expect(mostAtOnce).toBe(4)
    expect(counts.size).toBe(60)
    expect(counts.get('d0')).toBe(0)
    expect(counts.get('d4')).toBe(1)
    expect(counts.get('d59')).toBe(2)
    // Beyond the budget the link says "View".
    expect(counts.has('d60')).toBe(false)
  })

  it('asks for a department once: a reload counts only the one just made', async () => {
    const { counts, count } = page()
    void count(ids(3))
    // Loaded again while the first answers are on their way.
    void count(ids(3))
    await tick()
    expect(calls.map((c) => c.dept)).toEqual(['d0', 'd1', 'd2'])
    await answerAll()
    void count([...ids(3), 'd7'])
    await tick()
    expect(calls.map((c) => c.dept)).toEqual(['d0', 'd1', 'd2', 'd7'])
    await answerAll()
    expect(counts.get('d7')).toBe(1)
  })

  it('never has more than four under way, however often it is asked', async () => {
    const { count } = page()
    void count(ids(6))
    void count(ids(6, 6))
    await tick()
    expect(calls).toHaveLength(4)
    await answerAll()
    expect(calls).toHaveLength(12)
    expect(mostAtOnce).toBe(4)
  })

  it('asks nothing more once the page is left, and aborts what is under way', async () => {
    const { count, leave } = page()
    void count(ids(20))
    await tick()
    expect(calls).toHaveLength(4)
    const underWay = calls.map((c) => c.signal)
    leave()
    expect(underWay.every((s) => s?.aborted)).toBe(true)
    await answerAll()
    expect(calls).toHaveLength(4)
    // A reload that lands after it asks nothing either.
    await count(ids(5, 40))
    expect(calls).toHaveLength(4)
  })

  it('leaves a department it could not count uncounted', async () => {
    const { counts, count } = page()
    const done = count(['d1', 'd2'])
    await tick()
    calls[0]!.answered = true
    calls[0]!.fail()
    await answerAll()
    await done
    expect(counts.has('d1')).toBe(false)
    expect(counts.get('d2')).toBe(2)
  })

  it('after forget() counts everything again, showing the old counts until the new are in', async () => {
    const { counts, count, forget } = page()
    void count(ids(2))
    await answerAll()
    expect(counts.get('d1')).toBe(1)
    forget()
    void count(ids(2))
    await tick()
    expect(calls.map((c) => c.dept)).toEqual(['d0', 'd1', 'd0', 'd1'])
    expect(counts.get('d1')).toBe(1)
    await answerAll(() => 5)
    expect(counts.get('d1')).toBe(5)
  })
})
