// How fast a transfer goes, and how long the rest of it will take.
//
// A browser reports an upload's progress as the bytes it has handed to the
// network, many times a second. The first reports run ahead of the wire (the
// socket's buffers fill at once), so the speed is taken over the last few
// seconds only, and none is given until the transfer has run for a moment.

export interface RateSample {
  /** When, in milliseconds (any clock, as long as it is the same one). */
  t: number
  /** How many bytes had gone by then, in all. */
  bytes: number
}

export class RateMeter {
  private samples: RateSample[] = []

  /**
   * windowMs: how far back the speed is taken over. minSpanMs: how long the
   * samples must span before a speed is given at all.
   */
  constructor(
    private readonly windowMs = 5_000,
    private readonly minSpanMs = 800,
  ) {}

  /** Forgets every sample: the transfer starts again. */
  reset(): void {
    this.samples = []
  }

  /** Notes that `bytes` had gone by at `t`. A count that goes backwards starts the meter again. */
  add(t: number, bytes: number): void {
    const last = this.samples[this.samples.length - 1]
    if (last && (bytes < last.bytes || t < last.t)) this.samples = []
    this.samples.push({ t, bytes })
    // Keep one sample from before the window, so that the window is full.
    while (this.samples.length > 2 && this.samples[1]!.t <= t - this.windowMs) this.samples.shift()
  }

  /** Bytes a second over the window, or null while there is too little to go on. */
  rate(): number | null {
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    if (!first || !last || last === first) return null
    const span = last.t - first.t
    if (span < this.minSpanMs) return null
    return ((last.bytes - first.bytes) * 1000) / span
  }

  /** Whole seconds until `total` bytes have gone by at the present speed, or null when that cannot be said. */
  secondsLeft(total: number): number | null {
    const rate = this.rate()
    const last = this.samples[this.samples.length - 1]
    if (rate === null || !last) return null
    const left = total - last.bytes
    if (left <= 0) return 0
    if (rate <= 0) return null
    return Math.ceil(left / rate)
  }
}
