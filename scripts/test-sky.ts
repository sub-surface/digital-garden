/** Seasons, sun and moon (src/features/ambience/sky.ts). */
import assert from "node:assert/strict"
import { lightPhase, moonPhase, nextTurn, seasonOf, seasonTurn, solarElevation, weatherParticle } from "../src/features/ambience/sky"

const nov8 = new Date(2026, 10, 8, 12)
assert.equal(seasonOf(nov8), "autumn")
assert.equal(seasonOf(nov8, true), "spring", "the south has the opposite season")
assert.equal(seasonTurn(nov8), null, "no flurry in early November")
assert.equal(nextTurn(nov8).season, "winter")
assert.deepEqual(seasonTurn(new Date(2026, 11, 23)), { season: "winter", days: 2 })
assert.equal(seasonTurn(new Date(2026, 2, 17))?.season, "spring", "the window opens before the equinox")
assert.equal(seasonOf(new Date(2026, 0, 5)), "winter", "January is still last year's winter")

const noon = solarElevation(new Date(Date.UTC(2026, 5, 21, 12)), 51.5, 0)
assert(noon > 60 && noon < 63, `London midsummer noon ≈ 62°, got ${noon}`)
assert(solarElevation(new Date(Date.UTC(2026, 5, 21, 0)), 51.5, 0) < -10)
assert.equal(lightPhase(new Date(Date.UTC(2026, 10, 8, 22)), 51.5, 0), "night")
assert.equal(lightPhase(new Date(Date.UTC(2026, 10, 8, 16, 20)), 51.5, 0), "dusk")

assert.equal(moonPhase(new Date(Date.UTC(2024, 3, 8, 18))).name, "new moon", "the April 2024 eclipse was a new moon")
assert.equal(moonPhase(new Date(Date.UTC(2024, 3, 23, 23))).name, "full moon")

assert.equal(weatherParticle(0), null)
assert.equal(weatherParticle(63)?.kind, "rain")
assert.equal(weatherParticle(75)?.kind, "snow")

console.log("Sky: seasons, sun, moon and weather mapping check out.")
