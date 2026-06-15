/**
 * bootRng.ts — Deterministic seeded random number generator
 * Xorshift32 with FNV-1a mixing for avalanche distribution
 */

export class SeededRNG {
  private state: number

  constructor(seed: number) {
    // Ensure state is a valid unsigned 32-bit integer
    this.state = (seed >>> 0) || 1
  }

  /**
   * Next unsigned 32-bit integer
   */
  next(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >> 17
    x ^= x << 5
    this.state = x >>> 0
    return this.state
  }

  /**
   * Normalized float in [0, 1)
   */
  float(): number {
    return (this.next() >>> 0) / 0x100000000
  }

  /**
   * Integer in [0, max)
   */
  int(max: number): number {
    return Math.floor(this.float() * max)
  }

  /**
   * Choose random element from array
   */
  choice<T>(arr: T[]): T {
    return arr[this.int(arr.length)]
  }

  /**
   * Fork a new RNG with a deterministic offset
   */
  fork(): SeededRNG {
    return new SeededRNG(this.next())
  }
}
