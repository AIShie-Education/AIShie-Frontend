import { describe, expect, it } from 'vitest'
import {
  below,
  ChaCha8,
  deal,
  instantKey,
  newGroups,
  newSeed,
  NoRoom,
  order,
  sha256,
  source,
  validSeed,
  type DealGroup,
} from './split'

// The deal is the server's (AIShie-Core internal/groupsplit), worked out here
// to preview it: these are that package's golden values, so that a change on
// either side that would deal another way fails here first.

/** A seat id whose order is n's, as UUID v7 seats are in the order they were seated. */
const seat = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
const seats = (n: number) => Array.from({ length: n }, (_, i) => seat(i + 1))
const short = (ids: string[]) => ids.map((id) => id.slice(24).replace(/^0+/, '')).join(' ')
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

describe('the split’s deal', () => {
  it('hashes with SHA-256', () => {
    expect(hex(sha256(new TextEncoder().encode('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    // Two blocks: 56 bytes and more.
    expect(hex(sha256(new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('draws from the generator the server pins: its first two words for the seed lab-2026', () => {
    const src = source('lab-2026')
    expect(src.uint64()).toBe(7146087731461242251n)
    expect(src.uint64()).toBe(16347766031737719105n)
  })

  it('draws past the generator’s first blocks and through its rekeying, as the reference does', () => {
    // The words Go's math/rand/v2 ChaCha8 gives for this seed: the first ones, the last before the
    // generator makes itself a new key from its own output (after 124 words), the first after, and
    // the thousandth.
    const seed = new TextEncoder().encode('chacha8rand key for testing\u0000\u0000\u0000\u0000\u0000')
    expect(seed.length).toBe(32)
    const src = new ChaCha8(seed)
    const words: bigint[] = []
    for (let i = 0; i < 1000; i++) words.push(src.uint64())
    expect(words[0]).toBe(0x95615cf8e73b5742n)
    expect(words[1]).toBe(0xd4191ca4c5b5acden)
    expect(words[2]).toBe(0x5f4772220fbb144an)
    expect(words[123]).toBe(0x83f0d247a1684cn)
    expect(words[124]).toBe(0xeb91178e74010e26n)
    expect(words[999]).toBe(0xab87abb8faee4f36n)
  })

  it('orders students by the seed alone, whatever order they are given in', () => {
    const golden: Record<string, string> = {
      'lab-2026': '7 1 5 2 6 4 3',
      A: '3 5 1 7 6 4 2',
      QK3M7ZP2VX9D: '1 7 5 4 3 2 6',
    }
    for (const [seed, want] of Object.entries(golden)) {
      const given = seats(7)
      expect(short(order(given, seed)), seed).toBe(want)
      expect(short(order([...given].reverse(), seed)), seed).toBe(want)
      expect(short(given)).toBe('1 2 3 4 5 6 7')
    }
    expect(order([], 'x')).toEqual([])
  })

  it('draws uniformly: every index, none favoured', () => {
    const src = source('uniform')
    const counts = new Array(7).fill(0)
    for (let i = 0; i < 70000; i++) counts[below(src, 7)]++
    for (const c of counts) {
      expect(c).toBeGreaterThan(9500)
      expect(c).toBeLessThan(10500)
    }
    expect(below(src, 1)).toBe(0)
  })

  it('puts each student in the group with the fewest members, the oldest first among equals', () => {
    const t0 = '2026-10-05T09:00:00Z'
    const t1 = '2026-10-05T09:01:00Z'
    const a = '00000000-0000-7000-8000-0000000000a1'
    const b = '00000000-0000-7000-8000-0000000000b1'
    const c = '00000000-0000-7000-8000-0000000000c1'
    const groups: DealGroup[] = [
      { id: c, createdAt: t1, members: 0, capacity: 0 },
      { id: b, createdAt: t0, members: 1, capacity: 0 },
      { id: a, createdAt: t0, members: 0, capacity: 0 },
    ]
    expect(short(order(seats(5), 'lab-2026'))).toBe('1 4 3 5 2')
    expect(deal(seats(5), groups, 0, 'lab-2026').map((p) => p.group)).toEqual([a, c, a, b, c])

    const capped: DealGroup[] = [
      { id: a, createdAt: t0, members: 0, capacity: 1 },
      { id: b, createdAt: t0, members: 2, capacity: 0 },
    ]
    expect(deal(seats(2), capped, 3, 'x').map((p) => p.group)).toEqual([a, b])
    expect(() => deal(seats(3), capped, 3, 'x')).toThrow(NoRoom)
    expect(() => deal(seats(1), [], 0, 'x')).toThrow(NoRoom)
    expect(deal([], [], 0, 'x')).toEqual([])
  })

  it('orders groups made at the same moment by their id, past the millisecond, and the split’s own after all', () => {
    expect(instantKey('2026-10-05T09:00:00.000001Z') > instantKey('2026-10-05T09:00:00Z')).toBe(true)
    expect(instantKey('2026-10-05T17:00:00+08:00')).toBe(instantKey('2026-10-05T09:00:00Z'))
    const old = { id: seat(9), createdAt: '2026-10-05T09:00:00.000002Z', members: 0, capacity: 0 }
    const older = { id: seat(8), createdAt: '2026-10-05T09:00:00.000001Z', members: 0, capacity: 0 }
    const made = { id: seat(1), createdAt: '', made: 1, members: 0, capacity: 0 }
    // One student goes to the oldest, then the next; the split's own last.
    expect(deal(seats(3), [made, old, older], 0, 'A').map((p) => p.group)).toEqual([seat(8), seat(9), seat(1)])
  })

  it('deals the same way for the same seed, and evenly', () => {
    const t0 = '2026-10-05T09:00:00Z'
    const groups = [101, 102, 103].map((n) => ({ id: seat(n), createdAt: t0, members: 0, capacity: 0 }))
    const one = deal(seats(30), groups, 0, 'same')
    expect(deal(seats(30), groups, 0, 'same')).toEqual(one)
    expect(deal(seats(30), groups, 0, 'other')).not.toEqual(one)
    const sizes = new Map<string, number>()
    for (const p of one) sizes.set(p.group, (sizes.get(p.group) ?? 0) + 1)
    expect([...sizes.values()]).toEqual([10, 10, 10])
  })

  it('takes seeds of 1 to 64 printable ASCII characters, and makes twelve base32 ones', () => {
    for (const s of ['a', 'lab 2026', 'x'.repeat(64), '~!@#']) expect(validSeed(s), s).toBe(true)
    for (const s of ['', 'x'.repeat(65), 'tab\there', 'é', 'line\n']) expect(validSeed(s), s).toBe(false)
    const a = newSeed()
    expect(a).toMatch(/^[A-Z2-7]{12}$/)
    expect(newSeed()).not.toBe(a)
    expect(newSeed(() => new Uint8Array(8))).toBe('AAAAAAAAAAAA')
    expect(newSeed(() => new Uint8Array(8).fill(255))).toBe('777777777777')
  })

  it('makes as many groups as the server does', () => {
    const cases: [Parameters<typeof newGroups>, number][] = [
      [['count', 5, 0, 0, 0, 23], 5],
      [['count', 5, 2, 1, 3, 10], 3],
      [['count', 2, 4, 4, 0, 10], 0],
      [['size', 4, 0, 0, 0, 23], 6],
      [['size', 4, 3, 3, 5, 10], 1],
      [['size', 4, 9, 9, 0, 8], 0],
      [['size', 0, 0, 0, 0, 8], 0],
      [['size', 500, 0, 0, 0, 1], 1],
      [['count', 1, 0, 0, 0, 0], 1],
      [['size', 3, 0, 0, 0, 0], 0],
    ]
    for (const [args, want] of cases) expect(newGroups(...args), JSON.stringify(args)).toBe(want)
  })
})
