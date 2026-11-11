/**
 * Commons: three herders, one meadow. Each season every herder chooses how
 * many sheep to put out to graze (0–6), all at once. The grass is shared out
 * in proportion when there isn't enough; whatever is left regrows
 * logistically, fastest at half full, not at all when bare. You score what
 * your flock eats. Sixteen seasons.
 *
 * The meadow regrows at most ~10 a season, so three herders can graze ~3 sheep
 * each indefinitely, while one herder grazing 6 does better for a while and
 * ruins it for everyone. A herder may also *fence out* one neighbour for a
 * season at a cost of 1 point: the neighbour may graze at most 2 next
 * season. Costly punishment, after Ostrom's commons and the
 * public-goods experiments: it only pays if it changes what others do.
 *
 * Neighbours have temperaments (see PERSONAS). Pure; tested by
 * scripts/test-games.ts.
 */
export const SEASONS = 16
export const MAX_GRAZE = 6
export const FENCED_MAX = 2
export const CAPACITY = 100
export const GROWTH = 0.42
export const FENCE_COST = 1

export type Persona = "you" | "steward" | "mirror" | "grazier" | "opportunist"

export const PERSONAS: Record<Exclude<Persona, "you">, { name: string; about: string }> = {
  steward: { name: "Steward", about: "grazes a fair share of what regrows, and fences out anyone who takes much more" },
  mirror: { name: "Mirror", about: "does as the others did last season, and fences back whoever fenced it" },
  grazier: { name: "Grazier", about: "puts out nearly the whole flock, and eases off only when fenced" },
  opportunist: { name: "Opportunist", about: "plays fair while the grass is thick, grabs when it thins" },
}

export interface Herder { persona: Persona; total: number }

export interface Choice { graze: number; fence: number | null }

export interface SeasonLog {
  grassBefore: number
  choices: Choice[]
  eaten: number[]
  grassAfter: number
}

export interface CommonsState {
  season: number
  grass: number
  herders: Herder[]
  /** Max graze allowed this season per herder (fenced herders are capped). */
  caps: number[]
  log: SeasonLog[]
  done: boolean
}

export function newCommons(neighbours: [Exclude<Persona, "you">, Exclude<Persona, "you">]): CommonsState {
  return {
    season: 0,
    grass: 70,
    herders: [{ persona: "you", total: 0 }, ...neighbours.map((p) => ({ persona: p, total: 0 }))],
    caps: [MAX_GRAZE, MAX_GRAZE, MAX_GRAZE],
    log: [],
    done: false,
  }
}

export const regrowth = (g: number) => GROWTH * g * (1 - g / CAPACITY)

/** The most the meadow can give per season forever: regrowth at half capacity. */
export const SUSTAINABLE = regrowth(CAPACITY / 2)

export function season(s: CommonsState, choices: Choice[]): CommonsState {
  if (s.done) throw new Error("game over")
  const n = s.herders.length
  const graze = choices.map((c, i) => Math.max(0, Math.min(s.caps[i], Math.round(c.graze))))
  const demand = graze.reduce((a, b) => a + b, 0)
  const share = demand > 0 ? Math.min(1, s.grass / demand) : 0
  const eaten = graze.map((g) => g * share)
  const left = Math.max(0, s.grass - eaten.reduce((a, b) => a + b, 0))
  const grassAfter = Math.min(CAPACITY, left + regrowth(left))
  const caps = new Array(n).fill(MAX_GRAZE)
  const herders = s.herders.map((h, i) => ({ ...h, total: h.total + eaten[i] }))
  choices.forEach((c, i) => {
    if (c.fence === null || c.fence === i || c.fence < 0 || c.fence >= n) return
    caps[c.fence] = FENCED_MAX
    herders[i].total -= FENCE_COST
  })
  const next = s.season + 1
  return {
    season: next,
    grass: grassAfter,
    herders,
    caps,
    log: [...s.log, { grassBefore: s.grass, choices: choices.map((c, i) => ({ graze: graze[i], fence: c.fence })), eaten, grassAfter }],
    done: next >= SEASONS,
  }
}

/** What a neighbour does this season. */
export function decide(s: CommonsState, i: number, r: () => number = Math.random): Choice {
  const p = s.herders[i].persona
  const n = s.herders.length
  const last = s.log[s.log.length - 1]
  const fair = Math.max(1, Math.round(regrowth(Math.max(s.grass, 20)) / n))
  const seasonsLeft = SEASONS - s.season
  const others = [...Array(n).keys()].filter((j) => j !== i)
  let graze = fair, fence: number | null = null
  switch (p) {
    case "steward": {
      graze = fair
      if (last) {
        const lastFair = Math.max(1, Math.round(regrowth(Math.max(last.grassBefore, 20)) / n))
        const worst = others.reduce((a, b) => (last.choices[b].graze > last.choices[a].graze ? b : a))
        if (last.choices[worst].graze >= lastFair + 2) fence = worst
      }
      // The meadow is thin: rest it.
      if (s.grass < 25) graze = Math.max(0, fair - 1)
      break
    }
    case "mirror": {
      if (!last) { graze = fair; break }
      const avg = others.reduce((a, j) => a + last.choices[j].graze, 0) / others.length
      graze = Math.round(avg)
      const fencer = others.find((j) => last.choices[j].fence === i)
      if (fencer !== undefined) fence = fencer
      break
    }
    case "grazier": {
      const fencedLately = s.log.slice(-2).some((l) => l.choices.some((c) => c.fence === i))
      graze = fencedLately ? fair + 1 : MAX_GRAZE - (r() < 0.3 ? 1 : 0)
      break
    }
    case "opportunist": {
      graze = s.grass > 55 ? fair : s.grass > 30 ? fair + 2 : MAX_GRAZE
      if (seasonsLeft <= 2) graze = MAX_GRAZE // nothing left to save it for
      break
    }
    default:
      break
  }
  return { graze: Math.max(0, Math.min(s.caps[i], graze)), fence }
}

/** Everyone's total against what perfect restraint would have given everyone. */
export function welfare(s: CommonsState): { got: number; possible: number } {
  const got = s.log.reduce((a, l) => a + l.eaten.reduce((x, y) => x + y, 0), 0)
  // A ceiling: graze down to half capacity (where regrowth is fastest), hold
  // it there, and eat what's left in the last season, within the flock limit.
  const most = MAX_GRAZE * s.herders.length
  let g = 70, possible = 0
  for (let t = 0; t < SEASONS; t++) {
    const take = Math.min(most, t === SEASONS - 1 ? g : Math.max(0, g - CAPACITY / 2))
    possible += take
    const left = g - take
    g = Math.min(CAPACITY, left + regrowth(left))
  }
  return { got, possible }
}
