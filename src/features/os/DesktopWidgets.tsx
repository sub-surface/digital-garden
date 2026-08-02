import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { apiErrorMessage, apiGet } from "@/lib/api"
import { TASKBAR_H } from "./Taskbar"
import { useOS, useOSSettings, type OSCustomFeed, type OSWidgetId } from "./osStore"
import styles from "./OS.module.scss"

interface FeedItem { title: string; link: string; source?: string }
interface NewsData { source: string; fetchedAt: string; items: (FeedItem & { publishedAt: string | null })[] }
interface WeatherData {
  fetchedAt: string
  current: Record<string, number | string>
  units: Record<string, string>
  attribution: string
}

const WEATHER: Record<number, string> = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog",
  51: "drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "rain", 63: "rain", 65: "heavy rain",
  71: "snow", 73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorm",
}

const DEFAULTS: Record<OSWidgetId, CSSProperties> = {
  clock: { right: 14, top: 14 },
  calendar: { right: 14, top: 108 },
  weather: { right: 14, top: 322 },
  feeds: { right: 14, bottom: TASKBAR_H + 10 },
}

function freshness(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000))
  return minutes < 1 ? "just now" : `${minutes}m ago`
}

function parseBrowserFeed(xml: string, feed: OSCustomFeed): FeedItem[] {
  const document = new DOMParser().parseFromString(xml, "application/xml")
  if (document.querySelector("parsererror")) throw new Error("Invalid feed XML")
  return [...document.querySelectorAll("item, entry")].slice(0, 4).flatMap((node) => {
    const title = node.querySelector("title")?.textContent?.trim()
    const linkNode = node.querySelector("link")
    const link = linkNode?.getAttribute("href") ?? linkNode?.textContent?.trim()
    if (!title || !link || !/^https?:\/\//i.test(link)) return []
    return [{ title, link, source: feed.title }]
  })
}

function WidgetShell({ id, title, children }: { id: OSWidgetId; title: string; children: ReactNode }) {
  const saved = useOSSettings((state) => state.widgetPositions[id])
  const setPosition = useOSSettings((state) => state.setWidgetPosition)
  const openWindow = useOS((state) => state.openWindow)
  const [moving, setMoving] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const position = moving ?? saved

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return
    const parent = event.currentTarget.parentElement
    const width = parent?.offsetWidth ?? 220
    const height = parent?.offsetHeight ?? 100
    setMoving({
      x: Math.max(0, Math.min(window.innerWidth - width, event.clientX - drag.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - TASKBAR_H - height, event.clientY - drag.current.dy)),
    })
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (moving) setPosition(id, moving)
    drag.current = null
    setMoving(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <section
      className={styles.widget}
      data-widget={id}
      style={position ? { left: position.x, top: position.y } : DEFAULTS[id]}
      onContextMenu={(event) => {
        event.preventDefault()
        openWindow({ appId: "display", args: { tab: "widgets" }, title: "Display Properties", w: 500, h: 520 })
      }}
    >
      <header className={styles.widgetHandle} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {title}
      </header>
      {children}
    </section>
  )
}

function Calendar({ now }: { now: Date }) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const count = new Date(year, month + 1, 0).getDate()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const days = useMemo(() => Array.from({ length: offset + count }, (_, index) => index < offset ? null : index - offset + 1), [count, offset])
  return (
    <WidgetShell id="calendar" title={now.toLocaleDateString([], { month: "long", year: "numeric" })}>
      <div className={styles.widgetCalendar}>
        {"MTWTFSS".split("").map((day, index) => <span data-head key={`${day}-${index}`}>{day}</span>)}
        {days.map((day, index) => <span data-today={day === now.getDate() || undefined} key={`${day}-${index}`}>{day}</span>)}
      </div>
    </WidgetShell>
  )
}

export function DesktopWidgets() {
  const show = useOSSettings((state) => state.showWidgets)
  const network = useOSSettings((state) => state.networkWidgetsEnabled)
  const weatherEnabled = useOSSettings((state) => state.weatherEnabled)
  const location = useOSSettings((state) => state.weatherLocation)
  const customFeeds = useOSSettings((state) => state.customFeeds)
  const [now, setNow] = useState(() => new Date())
  const [news, setNews] = useState<NewsData | null>(null)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [customItems, setCustomItems] = useState<FeedItem[]>([])
  const [feedFailures, setFeedFailures] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!network) { setNews(null); setWeather(null); setCustomItems([]); setError(null); return }
    const controller = new AbortController()
    void apiGet<NewsData>("/api/widgets/news", { signal: controller.signal })
      .then(setNews)
      .catch((cause) => { if (!controller.signal.aborted) setError(apiErrorMessage(cause, "News unavailable.")) })
    if (weatherEnabled && location) {
      void apiGet<WeatherData>(`/api/widgets/weather?lat=${location.lat}&lon=${location.lon}`, { signal: controller.signal })
        .then(setWeather)
        .catch((cause) => { if (!controller.signal.aborted) setError(apiErrorMessage(cause, "Weather unavailable.")) })
    }
    void Promise.allSettled(customFeeds.map(async (feed) => {
      const response = await fetch(feed.url, { signal: controller.signal, headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } })
      if (!response.ok) throw new Error(`${feed.title}: HTTP ${response.status}`)
      return parseBrowserFeed(await response.text(), feed)
    })).then((results) => {
      if (controller.signal.aborted) return
      setCustomItems(results.flatMap((result) => result.status === "fulfilled" ? result.value : []))
      setFeedFailures(results.filter((result) => result.status === "rejected").length)
    })
    return () => controller.abort()
  }, [customFeeds, location, network, weatherEnabled])

  if (!show) return null
  const code = Number(weather?.current.weather_code)
  const feedItems: FeedItem[] = [
    ...(news?.items.slice(0, 4).map((item) => ({ ...item, source: news.source })) ?? []),
    ...customItems,
  ].slice(0, 8)
  return (
    <aside className={styles.widgets} aria-label="Desktop widgets">
      <WidgetShell id="clock" title="local time">
        <div className={styles.widgetClock}>
          <strong>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
          <span>{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</span>
        </div>
      </WidgetShell>
      <Calendar now={now} />
      {network && weatherEnabled && location && (
        <WidgetShell id="weather" title={`weather · ${weather ? freshness(weather.fetchedAt) : "calling"}`}>
          <div className={styles.widgetWeather}>
            {weather ? <><strong>{weather.current.temperature_2m}{weather.units.temperature_2m ?? "°C"}</strong><span>{WEATHER[code] ?? `code ${code}`} · {weather.attribution}</span></> : <span>waiting for current conditions…</span>}
          </div>
        </WidgetShell>
      )}
      {network && (
        <WidgetShell id="feeds" title={`feeds${news ? ` · ${freshness(news.fetchedAt)}` : ""}`}>
          <div className={styles.widgetNews}>
            {feedItems.map((item, index) => <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noopener noreferrer"><small>{item.source}</small>{item.title}</a>)}
            {!feedItems.length && <span>waiting for the wire…</span>}
            {feedFailures > 0 && <span>{feedFailures} custom feed(s) blocked or unavailable.</span>}
            {error && <span className={styles.widgetError} role="status">{error}</span>}
          </div>
        </WidgetShell>
      )}
    </aside>
  )
}
