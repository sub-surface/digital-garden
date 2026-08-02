import type { RouteCtx } from "./types"
import { jsonResponse } from "./lib"

const NEWS_SOURCES = {
  nyt: { label: "The New York Times / Technology", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
  garden: { label: "Sub-Surface Territories", url: "https://subsurfaces.net/rss.xml" },
} as const

function cleanXml(value: string): string {
  const text = value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/<[^>]+>/g, "")
    .trim()
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
}

function rssField(item: string, field: string): string {
  return cleanXml(item.match(new RegExp(`<${field}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${field}>`, "i"))?.[1] ?? "")
}

export function parseFeed(xml: string) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 6).map(([item]) => ({
    title: rssField(item, "title"),
    link: rssField(item, "link"),
    publishedAt: rssField(item, "pubDate") || null,
  })).filter((item) => item.title && /^https?:\/\//.test(item.link))
}

async function cached(
  key: string,
  seconds: number,
  waitUntil: RouteCtx["waitUntil"],
  load: () => Promise<Response>,
): Promise<Response> {
  const request = new Request(`https://widgets.subsurfaces.invalid/${key}`)
  const cache = caches.default
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await load()
  response.headers.set("Cache-Control", `public, max-age=${seconds}`)
  if (response.ok) waitUntil(cache.put(request, response.clone()))
  return response
}

export async function handleWidgetNews({ url, waitUntil }: RouteCtx): Promise<Response> {
  const sourceId = url.searchParams.get("source") === "garden" ? "garden" : "nyt"
  const source = NEWS_SOURCES[sourceId]
  return cached(`news/${sourceId}`, 900, waitUntil, async () => {
    const upstream = await fetch(source.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } })
    if (!upstream.ok) return jsonResponse({ error: "The news wire is not answering" }, 502)
    const items = parseFeed(await upstream.text())
    if (!items.length) return jsonResponse({ error: "The news wire returned no readable stories" }, 502)
    return jsonResponse({ source: source.label, fetchedAt: new Date().toISOString(), items })
  })
}

export async function handleWidgetWeather({ url, waitUntil }: RouteCtx): Promise<Response> {
  const latitude = Number(url.searchParams.get("lat"))
  const longitude = Number(url.searchParams.get("lon"))
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return jsonResponse({ error: "Invalid weather location" }, 400)
  }
  // Approximate coordinates also bound cache cardinality and avoid forwarding a
  // needlessly precise location to the provider.
  const lat = latitude.toFixed(2)
  const lon = longitude.toFixed(2)
  return cached(`weather/${lat}/${lon}`, 600, waitUntil, async () => {
    const endpoint = new URL("https://api.open-meteo.com/v1/forecast")
    endpoint.searchParams.set("latitude", lat)
    endpoint.searchParams.set("longitude", lon)
    endpoint.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day")
    endpoint.searchParams.set("timezone", "auto")
    const upstream = await fetch(endpoint)
    if (!upstream.ok) return jsonResponse({ error: "The weather station is not answering" }, 502)
    const data = await upstream.json<{
      current?: Record<string, number | string>
      current_units?: Record<string, string>
      timezone?: string
    }>()
    if (!data.current) return jsonResponse({ error: "The weather station returned no current conditions" }, 502)
    return jsonResponse({
      fetchedAt: new Date().toISOString(),
      location: { latitude: Number(lat), longitude: Number(lon), timezone: data.timezone ?? null },
      current: data.current,
      units: data.current_units ?? {},
      attribution: "Open-Meteo",
    })
  })
}
