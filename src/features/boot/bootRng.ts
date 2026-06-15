/**
 * Deterministic xorshift32 random number generator.
 *
 * Named forks derive from the original seed rather than the current state, so
 * changing one generator does not cascade through every later boot phase.
 */

import { mixSeed } from "./bootSeed"

const UINT32_RANGE = 0x1_0000_0000
const NON_ZERO_FALLBACK = 0x6d2b79f5

export class SeededRNG {
  readonly initialSeed: number
  private state: number

  constructor(seed: number) {
    const normalized = seed >>> 0
    this.initialSeed = normalized || NON_ZERO_FALLBACK
    this.state = this.initialSeed
  }

  nextUint32(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x >>> 0
    return this.state
  }

  /** Backwards-compatible alias. */
  next(): number {
    return this.nextUint32()
  }

  float(): number {
    return this.nextUint32() / UINT32_RANGE
  }

  /**
   * int(maxExclusive) -> [0, maxExclusive)
   * int(minInclusive, maxInclusive) -> inclusive range
   */
  int(maxExclusive: number): number
  int(minInclusive: number, maxInclusive: number): number
  int(first: number, second?: number): number {
    if (second === undefined) {
      if (!Number.isInteger(first) || first <= 0) {
        throw new RangeError(`Invalid exclusive upper bound: ${first}`)
      }
      return Math.floor(this.float() * first)
    }

    if (
      !Number.isInteger(first) ||
      !Number.isInteger(second) ||
      second < first
    ) {
      throw new RangeError(`Invalid integer range: ${first}..${second}`)
    }

    return first + Math.floor(this.float() * (second - first + 1))
  }

  chance(probability: number): boolean {
    const clamped = Math.min(1, Math.max(0, probability))
    return this.float() < clamped
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError("Cannot pick from an empty list")
    }
    return values[this.int(0, values.length - 1)]
  }

  /** Backwards-compatible alias. */
  choice<T>(values: readonly T[]): T {
    return this.pick(values)
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values]
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index)
      ;[result[index], result[swapIndex]] = [
        result[swapIndex],
        result[index],
      ]
    }
    return result
  }

  fork(label?: string | number): SeededRNG {
    if (label === undefined) {
      return new SeededRNG(this.nextUint32())
    }
    return new SeededRNG(mixSeed(this.initialSeed, String(label)))
  }
}
