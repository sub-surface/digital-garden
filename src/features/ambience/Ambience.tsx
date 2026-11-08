import { useEffect, useRef, useState } from "react"
import { useStore } from "@/store"
import { apiGet } from "@/lib/api"
import { FLURRY, guessPlace, lightPhase, seasonOf, seasonTurn, weatherParticle, type LightPhase, type Particle } from "./sky"
import styles from "./Ambience.module.scss"

/**
 * The sky behind the garden (Settings → Sky):
 *
 *  - Seasonal flurries (default on): for a few days around each solstice and
 *    equinox, the first page of a visit gets a short flurry of the incoming
 *    season (snow, blossom, fireflies, leaves). `season` replays one.
 *  - Light follows the sun (default off): a faint tint behind the page for
 *    dawn, golden hour, dusk and night, from the sun's real elevation.
 *  - Live weather (default off): rain or snow when it is raining or snowing
 *    where you are, from the connection's city-level location (no prompt; the
 *    Worker rounds it to ~10 km and keeps nothing).
 *
 * Both layers sit between the background canvas and the page, never over the
 * text, and the particle code only downloads when something will fall.
 */

const WEATHER_EVERY_MS = 30 * 60_000
const LIGHT_EVERY_MS = 5 * 60_000
const FLURRY_MS = 40_000

interface WeatherPayload {
  location: { latitude: number; longitude: number }
  current: { weather_code?: number; temperature_2m?: number; is_day?: number }
}

export function Ambience() {
  const seasonal = useStore((s) => s.seasonal)
  const skyLight = useStore((s) => s.skyLight)
  const liveWeather = useStore((s) => s.liveWeather)
  const weather = useStore((s) => s.weatherNow)
  const flurryRequest = useStore((s) => s.flurryRequest)
  const isReaderMode = useStore((s) => s.isReaderMode)
  const theme = useStore((s) => s.theme)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const running = useRef<{ stop: () => void } | null>(null)
  const [phase, setPhase] = useState<LightPhase | null>(null)

  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

  const play = (kind: Particle, durationMs?: number, density = 0.6) => {
    const canvas = canvasRef.current
    if (!canvas || reduceMotion) return
    running.current?.stop()
    void import("./particles").then(({ startFlurry }) => {
      const flurry = startFlurry(canvas, { kind, durationMs, density, theme: useStore.getState().theme })
      running.current = flurry
      void flurry.done.then(() => {
        if (running.current === flurry) running.current = null
      })
    })
  }

  // Live weather: fetched while visible, every half hour.
  useEffect(() => {
    if (!liveWeather) {
      useStore.getState().setWeatherNow(null)
      return
    }
    let cancelled = false
    const load = () => {
      if (document.visibilityState === "hidden") return
      apiGet<WeatherPayload>("/api/widgets/weather")
        .then((data) => {
          if (cancelled) return
          useStore.getState().setWeatherNow({
            code: Number(data.current.weather_code ?? 0),
            temperature: data.current.temperature_2m ?? null,
            isDay: data.current.is_day !== 0,
            lat: data.location.latitude,
            lon: data.location.longitude,
            fetchedAt: Date.now(),
          })
        })
        .catch((e) => console.warn("Ambience: weather unavailable:", e))
    }
    load()
    const id = window.setInterval(load, WEATHER_EVERY_MS)
    document.addEventListener("visibilitychange", load)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", load)
    }
  }, [liveWeather])

  // Weather particles run while it's actually raining/snowing (not in reader mode).
  const falling = liveWeather && weather ? weatherParticle(weather.code) : null
  useEffect(() => {
    if (!falling || isReaderMode) return
    play(falling.kind, undefined, falling.heavy ? 0.9 : 0.4)
    return () => running.current?.stop()
    // play is stable in behaviour; theme changes restart via the key below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falling?.kind, falling?.heavy, isReaderMode, theme])

  // The turn of the season: once per visit, on the first page.
  useEffect(() => {
    if (!seasonal || falling) return
    const southern = (weather?.lat ?? 1) < 0
    const turn = seasonTurn(new Date(), southern)
    if (!turn) return
    const key = `flurry:${turn.season}:${new Date().getFullYear()}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, "1")
    const t = window.setTimeout(() => play(FLURRY[turn.season], FLURRY_MS), 1500)
    return () => window.clearTimeout(t)
    // Once per mount; the session key guards repeats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonal])

  // Asked for (the `season` command, Settings).
  const handledRequest = useRef(flurryRequest?.id ?? 0)
  useEffect(() => {
    if (!flurryRequest || flurryRequest.id === handledRequest.current) return
    handledRequest.current = flurryRequest.id
    const southern = (weather?.lat ?? 1) < 0
    play(flurryRequest.kind ?? FLURRY[seasonOf(new Date(), southern)], flurryRequest.kind === "rain" ? 12_000 : FLURRY_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flurryRequest])

  // Light follows the sun.
  useEffect(() => {
    if (!skyLight) {
      setPhase(null)
      return
    }
    const update = () => {
      const place = weather ? { lat: weather.lat, lon: weather.lon } : guessPlace()
      setPhase(lightPhase(new Date(), place.lat, place.lon))
    }
    update()
    const id = window.setInterval(update, LIGHT_EVERY_MS)
    return () => window.clearInterval(id)
  }, [skyLight, weather])

  useEffect(() => () => running.current?.stop(), [])

  return (
    <>
      {phase && <div className={styles.light} data-phase={phase} data-theme-tone={theme} aria-hidden="true" />}
      <canvas ref={canvasRef} className={styles.particles} aria-hidden="true" data-panel-ignore />
    </>
  )
}
