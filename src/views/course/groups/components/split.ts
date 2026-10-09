// The random split of a course's students into a set's groups, worked out
// here as the server works it out (AIShie-Core internal/groupsplit), so that
// the split dialog shows what a seed deals before anyone is moved: the same
// seed, students and groups deal the same way, wherever it is worked out.
//
// The deal:
//
//  1. The students are put in a fixed order, their seat ids ascending (UUID
//     v7, so the order they were seated in).
//  2. They are shuffled by Fisher–Yates from the last index down: for each i
//     from n-1 to 1, an index j is drawn uniformly in [0, i] and the two
//     swapped. j is drawn by rejection sampling from successive 64-bit words
//     of a ChaCha8 generator (C2SP chacha8rand) seeded with the SHA-256 of
//     "aishie.group.split.v1\0" and the seed: x is taken if it is at most
//     2^64-1 - (2^64 mod (i+1)), and j is x mod (i+1).
//  3. Each student in turn goes to the eligible group with the fewest
//     members, ties broken by the group's created_at and then its id; a group
//     at its capacity, or at the limit (splitting by size), is not eligible.
//     A student with nowhere to go refuses the deal whole.

const SEED_DOMAIN = 'aishie.group.split.v1\u0000'

/** The longest seed, in characters. */
export const MAX_SEED = 64

/** Whether s may be a seed: 1 to 64 printable ASCII characters. */
export function validSeed(s: string): boolean {
  if (s.length === 0 || s.length > MAX_SEED) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) return false
  }
  return true
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** A new seed, as the server makes one: twelve base32 characters, from the browser's random source. */
export function newSeed(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(8))
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5 && out.length < 12) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out.slice(0, 12)
}

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4), of a string's UTF-8 bytes: the generator's key.
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
])

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** The SHA-256 of bytes. */
export function sha256(bytes: Uint8Array): Uint8Array {
  const len = bytes.length
  const padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64)
  padded.set(bytes)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  // The length in bits, as a 64-bit big-endian number: a seed is far below 2^32 bits.
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 0x100000000))
  view.setUint32(padded.length - 4, (len * 8) >>> 0)
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i])
  return out
}

// ---------------------------------------------------------------------------
// ChaCha8Rand (https://c2sp.org/chacha8rand), as Go's math/rand/v2 has it.
// ---------------------------------------------------------------------------

const CTR_INC = 4 // the counter moves by 4 from one block call to the next
const CTR_MAX = 16 // and the key is made afresh when it reaches 16
const CHUNK = 32 // each block call makes 32 words of 64 bits
const RESEED = 4 // of which the last 4 of every fourth call are the next key

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number) {
  x[a] = (x[a] + x[b]) >>> 0
  x[d] = rotl(x[d] ^ x[a], 16)
  x[c] = (x[c] + x[d]) >>> 0
  x[b] = rotl(x[b] ^ x[c], 12)
  x[a] = (x[a] + x[b]) >>> 0
  x[d] = rotl(x[d] ^ x[a], 8)
  x[c] = (x[c] + x[d]) >>> 0
  x[b] = rotl(x[b] ^ x[c], 7)
}
const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]

/**
 * Four ChaCha8 blocks of key (eight words) and the counters counter to
 * counter+3, interleaved as chacha8rand lays them out: word w of block b at
 * 4w+b, the key's words with the input added and the rest without. Read as
 * 64-bit little-endian words, out[2k] is the low half of the k-th and
 * out[2k+1] its high half.
 */
function block(key: Uint32Array, counter: number, out: Uint32Array) {
  const x = new Uint32Array(16)
  for (let col = 0; col < 4; col++) {
    x.set(SIGMA, 0)
    x.set(key, 4)
    x[12] = (counter + col) >>> 0
    x[13] = 0
    x[14] = 0
    x[15] = 0
    for (let round = 0; round < 4; round++) {
      quarterRound(x, 0, 4, 8, 12)
      quarterRound(x, 1, 5, 9, 13)
      quarterRound(x, 2, 6, 10, 14)
      quarterRound(x, 3, 7, 11, 15)
      quarterRound(x, 0, 5, 10, 15)
      quarterRound(x, 1, 6, 11, 12)
      quarterRound(x, 2, 7, 8, 13)
      quarterRound(x, 3, 4, 9, 14)
    }
    for (let w = 0; w < 16; w++) {
      out[4 * w + col] = w >= 4 && w < 12 ? (x[w] + key[w - 4]) >>> 0 : x[w]
    }
  }
}

/** A ChaCha8 generator of 64-bit words, from a 32-byte seed. */
export class ChaCha8 {
  private key = new Uint32Array(8)
  private buf = new Uint32Array(CHUNK * 2)
  private i = 0
  private n = CHUNK
  private c = 0

  constructor(seed: Uint8Array) {
    const view = new DataView(seed.buffer, seed.byteOffset, 32)
    for (let k = 0; k < 8; k++) this.key[k] = view.getUint32(k * 4, true)
    block(this.key, 0, this.buf)
  }

  private refill() {
    this.c += CTR_INC
    if (this.c === CTR_MAX) {
      this.key.set(this.buf.subarray((CHUNK - RESEED) * 2))
      this.c = 0
    }
    block(this.key, this.c, this.buf)
    this.i = 0
    this.n = this.c === CTR_MAX - CTR_INC ? CHUNK - RESEED : CHUNK
  }

  /** The next 64-bit word. */
  uint64(): bigint {
    if (this.i >= this.n) this.refill()
    const k = this.i++
    return (BigInt(this.buf[2 * k + 1]) << 32n) | BigInt(this.buf[2 * k])
  }
}

const MAX_U64 = (1n << 64n) - 1n

/** The deal's generator for a seed. */
export function source(seed: string): ChaCha8 {
  return new ChaCha8(sha256(new TextEncoder().encode(SEED_DOMAIN + seed)))
}

/** A draw, uniform in [0, n), by rejection: the values at the top of the range that would favour the smallest are drawn again. */
export function below(src: ChaCha8, n: number): number {
  const big = BigInt(n)
  const excess = ((MAX_U64 % big) + 1n) % big
  for (;;) {
    const x = src.uint64()
    if (x <= MAX_U64 - excess) return Number(x % big)
  }
}

/** Seat ids in the order the server sorts them: by their bytes, which is their lowercase text's order. */
function byId(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
}

/** The order the deal takes students in: by seat id, then shuffled by the seed. */
export function order(students: readonly string[], seed: string): string[] {
  const out = [...students].sort(byId)
  const src = source(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(src, i + 1)
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

/** A group students may be dealt into. */
export interface DealGroup {
  id: string
  /** When it was made, as an RFC 3339 time; groups a split makes come after every other, in order (`made`). */
  createdAt: string
  /** The how-manyth group the split makes (1, 2, …), for one it makes; it comes after every group there is. */
  made?: number
  /** Members it keeps before the deal. */
  members: number
  /** The most members it takes; 0 is no limit. */
  capacity: number
}

export interface Placement {
  student: string
  group: string
}

/** A time in RFC 3339 as a number of nanoseconds that orders it exactly, past what a Date holds. */
export function instantKey(at: string): bigint {
  const m = /^(.*?T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i.exec(at.trim())
  if (!m) {
    const ms = Date.parse(at)
    return BigInt(Number.isFinite(ms) ? ms : 0) * 1_000_000n
  }
  const seconds = Date.parse(`${m[1]}${m[3]}`)
  const fraction = BigInt((m[2] ?? '').padEnd(9, '0').slice(0, 9) || '0')
  return BigInt(Number.isFinite(seconds) ? seconds : 0) * 1_000_000n + fraction
}

function compareGroups(a: DealGroup, b: DealGroup): number {
  if (a.made !== undefined || b.made !== undefined) {
    if (a.made === undefined) return -1
    if (b.made === undefined) return 1
    if (a.made !== b.made) return a.made - b.made
    return byId(a.id, b.id)
  }
  const x = instantKey(a.createdAt)
  const y = instantKey(b.createdAt)
  if (x !== y) return x < y ? -1 : 1
  return byId(a.id, b.id)
}

/** A deal in which a student would have nowhere to go: every group that takes students full. */
export class NoRoom extends Error {
  constructor(public readonly students: number) {
    super('no_room')
  }
}

/**
 * Places students in groups: in `order`, each in the eligible group with the
 * fewest members. `limit`, above zero, is the most a group is dealt up to,
 * splitting by size. Nothing is placed if anyone would have nowhere to go
 * (NoRoom).
 */
export function deal(
  students: readonly string[],
  groups: readonly DealGroup[],
  limit: number,
  seed: string,
): Placement[] {
  const gs = groups.map((g) => ({ ...g })).sort(compareGroups)
  const out: Placement[] = []
  for (const s of order(students, seed)) {
    let best = -1
    gs.forEach((g, i) => {
      if ((g.capacity > 0 && g.members >= g.capacity) || (limit > 0 && g.members >= limit)) return
      if (best < 0 || g.members < gs[best].members) best = i
    })
    if (best < 0) throw new NoRoom(students.length)
    gs[best].members++
    out.push({ student: s, group: gs[best].id })
  }
  return out
}

export type SplitBy = 'size' | 'count'
export type SplitFrom = 'unassigned' | 'all'

/**
 * How many groups a split makes, as well as those there are. By count, until
 * the set has n groups not archived (those it keeps counting). By size, until
 * there are ⌈(members + toDeal) / n⌉ groups taking students, `eligible` of
 * them there already, where `members` are those the eligible groups keep.
 */
export function newGroups(
  by: SplitBy,
  n: number,
  notArchived: number,
  eligible: number,
  members: number,
  toDeal: number,
): number {
  if (n <= 0) return 0
  const want = by === 'count' ? n - notArchived : Math.ceil((members + toDeal) / n) - eligible
  return Math.max(want, 0)
}
