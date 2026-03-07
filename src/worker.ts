interface Env {
  ASSETS: Fetcher
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
}

interface NoteMeta {
  title?: string
  description?: string
  excerpt?: string
  image?: string
  cover?: string
  poster?: string
}

// In-memory cache — survives for the lifetime of the Worker instance
let contentIndexCache: Record<string, NoteMeta> | null = null

async function getContentIndex(assetsFetcher: Fetcher): Promise<Record<string, NoteMeta>> {
  if (contentIndexCache) return contentIndexCache
  try {
    const res = await assetsFetcher.fetch("https://assets.internal/content-index.json")
    if (res.ok) contentIndexCache = await res.json()
  } catch {}
  return contentIndexCache ?? {}
}

function slugFromPathname(pathname: string): string {
  // Strip leading slash, decode, normalise spaces to hyphens
  return decodeURIComponent(pathname.replace(/^\//, "").replace(/\/$/, "") || "index")
    .replace(/\s+/g, "-")
}

function resolveMetaCaseInsensitive(index: Record<string, NoteMeta>, slug: string): NoteMeta | null {
  if (index[slug]) return index[slug]
  const lower = slug.toLowerCase()
  const key = Object.keys(index).find(k => k.toLowerCase() === lower)
  return key ? index[key] : null
}

function injectMetaTags(html: string, meta: NoteMeta, slug: string, origin: string): string {
  const isWiki = origin.includes("wiki.subsurfaces.net")
  const siteName = isWiki ? "Philchat Wiki" : "Sub-Surface Territories"
  const title = meta.title ? `${meta.title} — ${siteName}` : siteName
  const rawDesc = meta.description ?? meta.excerpt ?? "A digital garden."
  const description = rawDesc
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[(\^[^\]]+)\]/g, "")
    .replace(/\\([\[\]])/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const ogSlug = slug.replace(/\//g, "-")
  const thumbnail = meta.image || meta.cover || meta.poster
  const ogImage = thumbnail
    ? (thumbnail.startsWith("http") ? thumbnail : `${origin}${thumbnail}`)
    : `${origin}/og/${ogSlug}.png`
  const canonical = `${origin}/${slug === "index" ? "" : slug}`

  const tags = [
    `<meta name="description" content="${escAttr(description)}" />`,
    `<meta property="og:title" content="${escAttr(title)}" />`,
    `<meta property="og:description" content="${escAttr(description)}" />`,
    `<meta property="og:image" content="${escAttr(ogImage)}" />`,
    `<meta property="og:url" content="${escAttr(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escAttr(title)}" />`,
    `<meta name="twitter:description" content="${escAttr(description)}" />`,
    `<meta name="twitter:image" content="${escAttr(ogImage)}" />`,
    `<title>${escText(title)}</title>`,
  ].join("\n    ")

  // Replace the static <title> and inject before </head>
  return html
    .replace(/<title>[^<]*<\/title>/, "")
    .replace("</head>", `    ${tags}\n  </head>`)
}

function escAttr(s: string) { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;") }
function escText(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;") }

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  if (!env.TURNSTILE_SECRET_KEY || !env.GITHUB_TOKEN) {
    return Response.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!body.name?.trim() || !body.username?.trim() || !body.turnstileToken) {
    return Response.json({ error: "Missing required fields" }, { status: 400 })
  }

  const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken }),
  })
  const tsData = await tsRes.json<{ success: boolean }>()
  if (!tsData.success) {
    return Response.json({ error: "Captcha validation failed" }, { status: 400 })
  }

  function gh(path: string, method: string, payload?: unknown) {
    return fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "digital-garden-wiki-submit/1.0",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
  }

  try {
    const refRes = await gh("/repos/sub-surface/digital-garden/git/ref/heads/master", "GET")
    if (!refRes.ok) {
      const txt = await refRes.text()
      throw new Error(`get ref: ${refRes.status} — ${txt}`)
    }
    const { object: { sha: mainSha } } = await refRes.json<{ object: { sha: string } }>()

    const safeName = body.username.replace(/^[^a-zA-Z0-9]+/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
    const branchName = `submit/${safeName}-${Date.now()}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`

    const branchRes = await gh("/repos/sub-surface/digital-garden/git/refs", "POST", {
      ref: `refs/heads/${branchName}`, sha: mainSha,
    })
    if (!branchRes.ok) {
      const txt = await branchRes.text()
      throw new Error(`create branch: ${branchRes.status} — ${txt}`)
    }

    let resolvedImageUrl = body.imageUrl || ""
    if (body.imageBase64 && body.imageFilename) {
      const rawExt = body.imageFilename.split(".").pop()?.toLowerCase() ?? ""
      const ext = ["jpg", "jpeg", "png", "gif", "webp"].includes(rawExt) ? rawExt : "jpg"
      const imgPath = `content/Media/Wiki/chatters/${safeName}.${ext}`
      const imgRes = await gh(`/repos/sub-surface/digital-garden/contents/${imgPath}`, "PUT", {
        message: `wiki: add profile image for ${body.username}`,
        content: body.imageBase64,
        branch: branchName,
      })
      if (!imgRes.ok) throw new Error(`commit image: ${imgRes.status}`)
      resolvedImageUrl = `/content/Media/Wiki/chatters/${safeName}.${ext}`
    }

    const fm = [
      "---",
      `title: "${body.name}'s Profile"`,
      `description: "Philchat wiki profile for ${body.name}"`,
      "tags: [wiki, chatter]", "type: chatter",
      `username: "${body.username}"`,
      body.pronouns ? `pronouns: "${body.pronouns}"` : null,
      resolvedImageUrl ? `image: "${resolvedImageUrl}"` : null,
      body.tradition ? `tradition: "${body.tradition}"` : null,
      body.aos ? `aos: "${body.aos}"` : null,
      body.influences ? `influences: "${body.influences}"` : null,
      "draft: true", "---",
    ].filter(Boolean).join("\n")

    const sectionDefs: [string, [string, string][]][] = [
      ["Metaphysics & Epistemology", [
        ["apriori","A priori knowledge"],["abstractObjects","Abstract objects"],["analyticSynthetic","Analytic-synthetic distinction"],
        ["epistemicJustification","Epistemic justification"],["externalWorld","External world"],["freeWill","Free will"],
        ["knowledge","Knowledge"],["knowledgeClaims","Knowledge claims"],["mentalContent","Mental content"],["mind","Mind"],
        ["perceptualExperience","Perceptual experience"],["personalIdentity","Personal identity"],["teletransporter","Teletransporter"],
        ["time","Time"],["truth","Truth"],["vagueness","Vagueness"],
      ]],
      ["Value Theory (Ethics, Politics, & Aesthetics)", [
        ["aestheticValue","Aesthetic value"],["eatingAnimals","Eating animals"],["experienceMachine","Experience machine"],
        ["footbridge","Footbridge"],["gender","Gender"],["meaningOfLife","Meaning of life"],["metaEthics","Meta-ethics"],
        ["moralJudgment","Moral judgment"],["moralMotivation","Moral motivation"],["moralPrinciples","Moral principles"],
        ["normativeEthics","Normative ethics"],["politicalPhilosophy","Political philosophy"],["race","Race"],["trolleyProblem","Trolley problem"],
      ]],
      ["Logic, Language, & Science", [
        ["lawsOfNature","Laws of nature"],["logic","Logic"],["newcomb","Newcomb's problem"],["properNames","Proper names"],["science","Science"],
      ]],
      ["Metaphilosophy & Religion", [
        ["aimOfPhilosophy","Aim of philosophy"],["god","God"],["philosophicalMethods","Philosophical methods"],["philosophicalProgress","Philosophical progress"],
      ]],
    ]

    const sections = sectionDefs.map(([title, qs]) =>
      `## ${title}\n` + qs.map(([k, l]) => `* **${l}:** ${body[k] || "[no answer]"}`).join("\n")
    ).join("\n\n")

    const notes = body.additionalNotes ? `\n\n---\n## Additional Notes\n${body.additionalNotes}` : ""
    const bodySection = body.bodyContent?.trim() ? `\n\n${body.bodyContent.trim()}\n\n---\n\n` : ""
    const markdown = `${fm}\n\n# ${body.name}'s Profile\n\n${bodySection}${sections}${notes}\n`

    const filePath = `content/Wiki/chatters/${safeName}.md`
    const commitRes = await gh(`/repos/sub-surface/digital-garden/contents/${filePath}`, "PUT", {
      message: `wiki: add profile submission for ${body.username}`,
      content: btoa(unescape(encodeURIComponent(markdown))),
      branch: branchName,
    })
    if (!commitRes.ok) throw new Error(`commit file: ${commitRes.status}`)

    const prRes = await gh("/repos/sub-surface/digital-garden/pulls", "POST", {
      title: `Wiki profile: ${body.username}`,
      head: branchName, base: "master",
      body: `New wiki profile submission for **${body.name}** (${body.username}).\n\nSubmitted via wiki.subsurfaces.net/wiki/submit`,
    })
    if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
    const { html_url } = await prRes.json<{ html_url: string }>()

    return Response.json({ prUrl: html_url }, { status: 200 })
  } catch (err) {
    console.error("Submit error:", err)
    return Response.json({ error: "Failed to create submission" }, { status: 500 })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env)
    }

    const response = await env.ASSETS.fetch(request)

    // Only rewrite HTML responses for GET requests (page navigations)
    const contentType = response.headers.get("content-type") ?? ""
    if (request.method !== "GET" || !contentType.includes("text/html")) {
      return response
    }

    const html = await response.text()
    const slug = slugFromPathname(url.pathname)
    const index = await getContentIndex(env.ASSETS)
    const meta = resolveMetaCaseInsensitive(index, slug)

    if (!meta) {
      // No entry found — still inject default tags
      return new Response(
        injectMetaTags(html, {}, slug, url.origin),
        { status: response.status, headers: response.headers }
      )
    }

    return new Response(
      injectMetaTags(html, meta, slug, url.origin),
      { status: response.status, headers: response.headers }
    )
  },
} satisfies ExportedHandler<Env>
