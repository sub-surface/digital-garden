// Playwright audit of the live site. Captures:
//   - console errors / warnings
//   - failed network requests (4xx / 5xx / CORS / worker)
//   - CLS (cumulative layout shift)
//   - long tasks (> 50ms)
//   - forced-reflow hotspots via Performance.measure hints
// Usage: node scripts/audit-site.mjs [baseUrl]
//
// Runs headless. Writes a JSON report to ./audit-report.json

import { chromium } from "playwright"
import { writeFileSync } from "fs"

const BASE = process.argv[2] ?? "https://subsurfaces.net"

const ROUTES = [
  { name: "home",         url: "/" },
  { name: "chess",        url: "/chess" },
  { name: "graph",        url: "/graph" },
  { name: "photography",  url: "/photography" },
  { name: "bookshelf",    url: "/bookshelf" },
  { name: "tags",         url: "/tags" },
  { name: "folder-root",  url: "/folder" },
  { name: "wiki-home",    url: "https://wiki.subsurfaces.net/" },
]

async function auditRoute(browser, route) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 audit-site.mjs",
  })
  const page = await ctx.newPage()

  const consoleMessages = []
  const pageErrors = []
  const failedRequests = []
  const workerErrors = []

  page.on("console", (msg) => {
    const type = msg.type()
    if (type === "error" || type === "warning") {
      consoleMessages.push({ type, text: msg.text().slice(0, 500) })
    }
  })

  page.on("pageerror", (err) => {
    pageErrors.push({ message: err.message, stack: err.stack?.split("\n").slice(0, 5).join(" | ") })
  })

  page.on("requestfailed", (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      failure: req.failure()?.errorText,
    })
  })

  page.on("response", (res) => {
    const status = res.status()
    if (status >= 400) {
      failedRequests.push({ url: res.url(), status, resourceType: res.request().resourceType() })
    }
  })

  page.on("worker", (worker) => {
    worker.on("pageerror", (err) => {
      workerErrors.push({ message: err.message })
    })
  })

  // Instrument for CLS + long tasks before navigation
  await page.addInitScript(() => {
    window.__metrics = { cls: 0, longtasks: [], lcp: 0 }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) window.__metrics.cls += entry.value
        }
      }).observe({ type: "layout-shift", buffered: true })

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__metrics.longtasks.push({ duration: entry.duration, name: entry.name })
        }
      }).observe({ type: "longtask", buffered: true })

      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        if (entries.length) window.__metrics.lcp = entries[entries.length - 1].startTime
      }).observe({ type: "largest-contentful-paint", buffered: true })
    } catch {}
  })

  const target = route.url.startsWith("http") ? route.url : BASE + route.url
  const t0 = Date.now()
  let navError = null
  try {
    await page.goto(target, { waitUntil: "networkidle", timeout: 20000 })
  } catch (e) {
    navError = e.message
  }
  const navMs = Date.now() - t0

  // Let the page settle — LCP and any deferred scripts
  await page.waitForTimeout(1500)

  const metrics = await page.evaluate(() => window.__metrics ?? {}).catch(() => ({}))

  // Check a few DOM signals
  const domSignals = await page.evaluate(() => {
    return {
      title: document.title,
      hasContent: document.body.innerText.length > 50,
      imgCount: document.images.length,
      imgBroken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
      canvasCount: document.querySelectorAll("canvas").length,
      workerRefs: typeof Worker !== "undefined",
    }
  }).catch(() => ({}))

  await ctx.close()

  return {
    route: route.name,
    url: target,
    navMs,
    navError,
    domSignals,
    metrics: {
      cls: Number((metrics.cls ?? 0).toFixed(4)),
      lcpMs: Math.round(metrics.lcp ?? 0),
      longtasks: (metrics.longtasks ?? []).length,
      longtaskTotalMs: Math.round((metrics.longtasks ?? []).reduce((s, t) => s + t.duration, 0)),
      longtaskMaxMs: Math.round(Math.max(0, ...(metrics.longtasks ?? []).map((t) => t.duration))),
    },
    errors: {
      console: consoleMessages,
      pageErrors,
      workerErrors,
      failedRequests: failedRequests.slice(0, 15),
      failedCount: failedRequests.length,
    },
  }
}

;(async () => {
  console.log(`Auditing ${BASE}`)
  const browser = await chromium.launch()
  const results = []
  for (const route of ROUTES) {
    process.stdout.write(`  ${route.name} ... `)
    const r = await auditRoute(browser, route)
    results.push(r)
    const errCount = r.errors.pageErrors.length + r.errors.console.filter((c) => c.type === "error").length
    console.log(`${r.navMs}ms  ${errCount} errs  CLS=${r.metrics.cls}  LCP=${r.metrics.lcpMs}ms  LT=${r.metrics.longtasks}`)
  }
  await browser.close()

  const report = { base: BASE, timestamp: new Date().toISOString(), results }
  writeFileSync("audit-report.json", JSON.stringify(report, null, 2))
  console.log("\nFull report → audit-report.json")
})()
