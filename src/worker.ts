interface Env {
  ASSETS: Fetcher
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
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

// ── Supabase auth helper ──

async function verifyAuth(request: Request, env: Env): Promise<{ id: string; role: string; email: string } | null> {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ") || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null

  const token = authHeader.slice(7)

  // Verify the JWT by calling Supabase auth
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_KEY },
  })
  if (!userRes.ok) return null
  const user = await userRes.json<{ id: string; email: string }>()

  // Fetch role from profiles table
  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!profileRes.ok) return null
  const profiles = await profileRes.json<{ role: string }[]>()
  const role = profiles?.[0]?.role ?? "pending"

  return { id: user.id, role, email: user.email }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

function jsonResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() })
}

// ── GitHub API helper (reusable) ──

function ghApi(env: Env) {
  return (path: string, method: string, payload?: unknown) =>
    fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "digital-garden-wiki-edit/1.0",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
}

// ── Supabase REST helper ──

function supabaseRest(env: Env, path: string, method = "GET", body?: unknown) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ── POST /api/auth/me ──

async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  return jsonResponse({ role: auth.role, email: auth.email })
}

// ── POST /api/edit ──

async function handleEdit(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth || (auth.role !== "editor" && auth.role !== "admin")) {
    return jsonResponse({ error: "Unauthorized" }, 403)
  }

  let body: Record<string, any>
  try { body = await request.json() } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  if (!body.slug?.trim() || !body.content?.trim() || !body.turnstileToken) {
    return jsonResponse({ error: "Missing required fields" }, 400)
  }

  // Verify Turnstile
  const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken }),
  })
  const tsData = await tsRes.json<{ success: boolean }>()
  if (!tsData.success) return jsonResponse({ error: "Captcha validation failed" }, 400)

  // Check page lock
  const lockRes = await supabaseRest(env, `page_locks?slug=eq.${encodeURIComponent(body.slug)}`)
  if (lockRes.ok) {
    const locks = await lockRes.json<{ slug: string }[]>()
    if (locks.length > 0) return jsonResponse({ error: "This page is locked" }, 403)
  }

  const gh = ghApi(env)

  try {
    // Resolve file path — try common patterns
    const slug = body.slug as string
    const filePath = `content/${slug.replace(/\s+/g, "-")}.md`

    // Get current file SHA (needed for update)
    const fileRes = await gh(`/repos/sub-surface/digital-garden/contents/${filePath}?ref=master`, "GET")
    if (!fileRes.ok) {
      // Try with spaces instead of hyphens
      const altPath = `content/${slug}.md`
      const altRes = await gh(`/repos/sub-surface/digital-garden/contents/${altPath}?ref=master`, "GET")
      if (!altRes.ok) {
        return jsonResponse({ error: "Could not find the source file on GitHub" }, 404)
      }
      const altData = await altRes.json<{ sha: string; path: string }>()
      return await createEditPR(gh, env, auth, altData.path, altData.sha, body.content, slug)
    }
    const fileData = await fileRes.json<{ sha: string; path: string }>()
    return await createEditPR(gh, env, auth, fileData.path, fileData.sha, body.content, slug)
  } catch (err) {
    console.error("Edit error:", err)
    return jsonResponse({ error: "Failed to create edit" }, 500)
  }
}

async function createEditPR(
  gh: ReturnType<typeof ghApi>,
  env: Env,
  auth: { id: string; email: string },
  filePath: string,
  fileSha: string,
  content: string,
  slug: string,
) {
  // Get master SHA
  const refRes = await gh("/repos/sub-surface/digital-garden/git/ref/heads/master", "GET")
  if (!refRes.ok) throw new Error(`get ref: ${refRes.status}`)
  const { object: { sha: masterSha } } = await refRes.json<{ object: { sha: string } }>()

  const safeName = auth.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
  const branchName = `edit/${safeName}-${Date.now().toString(36)}`

  // Create branch
  const branchRes = await gh("/repos/sub-surface/digital-garden/git/refs", "POST", {
    ref: `refs/heads/${branchName}`, sha: masterSha,
  })
  if (!branchRes.ok) throw new Error(`create branch: ${branchRes.status}`)

  // Commit updated file
  const commitRes = await gh(`/repos/sub-surface/digital-garden/contents/${filePath}`, "PUT", {
    message: `wiki: edit ${slug}`,
    content: btoa(unescape(encodeURIComponent(content))),
    sha: fileSha,
    branch: branchName,
  })
  if (!commitRes.ok) throw new Error(`commit file: ${commitRes.status}`)

  // Open PR
  const prRes = await gh("/repos/sub-surface/digital-garden/pulls", "POST", {
    title: `Wiki edit: ${slug.split("/").pop()?.replace(/-/g, " ")}`,
    head: branchName,
    base: "master",
    body: `Edit to **${slug}** by ${auth.email}.\n\nSubmitted via wiki editor.`,
  })
  if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
  const { html_url } = await prRes.json<{ html_url: string }>()

  // Log the edit
  await supabaseRest(env, "edit_log", "POST", {
    slug, user_id: auth.id, pr_url: html_url,
  })

  return jsonResponse({ prUrl: html_url })
}

// ── POST /api/new ──

async function handleNew(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth || (auth.role !== "editor" && auth.role !== "admin")) {
    return jsonResponse({ error: "Unauthorized" }, 403)
  }

  let body: Record<string, any>
  try { body = await request.json() } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  if (!body.title?.trim() || !body.filePath?.trim() || !body.content?.trim() || !body.turnstileToken) {
    return jsonResponse({ error: "Missing required fields" }, 400)
  }

  // Validate path is within content/Wiki/
  const filePath = body.filePath as string
  if (!filePath.startsWith("content/Wiki/") || filePath.includes("..")) {
    return jsonResponse({ error: "Invalid file path" }, 400)
  }

  // Verify Turnstile
  const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken }),
  })
  const tsData = await tsRes.json<{ success: boolean }>()
  if (!tsData.success) return jsonResponse({ error: "Captcha validation failed" }, 400)

  const gh = ghApi(env)

  try {
    // Get master SHA
    const refRes = await gh("/repos/sub-surface/digital-garden/git/ref/heads/master", "GET")
    if (!refRes.ok) throw new Error(`get ref: ${refRes.status}`)
    const { object: { sha: masterSha } } = await refRes.json<{ object: { sha: string } }>()

    const safeName = auth.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
    const branchName = `new/${safeName}-${Date.now().toString(36)}`

    // Create branch
    const branchRes = await gh("/repos/sub-surface/digital-garden/git/refs", "POST", {
      ref: `refs/heads/${branchName}`, sha: masterSha,
    })
    if (!branchRes.ok) throw new Error(`create branch: ${branchRes.status}`)

    // Commit new file
    const commitRes = await gh(`/repos/sub-surface/digital-garden/contents/${filePath}`, "PUT", {
      message: `wiki: add ${body.title}`,
      content: btoa(unescape(encodeURIComponent(body.content))),
      branch: branchName,
    })
    if (!commitRes.ok) throw new Error(`commit file: ${commitRes.status}`)

    // Open PR
    const prRes = await gh("/repos/sub-surface/digital-garden/pulls", "POST", {
      title: `Wiki new: ${body.title}`,
      head: branchName,
      base: "master",
      body: `New wiki article: **${body.title}** (${body.articleType || "misc"}) by ${auth.email}.\n\nSubmitted via wiki editor.`,
    })
    if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
    const { html_url } = await prRes.json<{ html_url: string }>()

    // Log the creation
    const slug = filePath.replace(/^content\//, "").replace(/\.md$/, "")
    await supabaseRest(env, "edit_log", "POST", {
      slug, user_id: auth.id, pr_url: html_url,
    })

    return jsonResponse({ prUrl: html_url })
  } catch (err) {
    console.error("New article error:", err)
    return jsonResponse({ error: "Failed to create article" }, 500)
  }
}

// ── GET /api/lock-status ──

async function handleLockStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const slug = url.searchParams.get("slug")
  if (!slug || !env.SUPABASE_URL) return jsonResponse({ locked: false })

  const res = await supabaseRest(env, `page_locks?slug=eq.${encodeURIComponent(slug)}&select=slug,reason`)
  if (!res.ok) return jsonResponse({ locked: false })
  const locks = await res.json<{ slug: string; reason: string }[]>()
  if (locks.length === 0) return jsonResponse({ locked: false })
  return jsonResponse({ locked: true, reason: locks[0].reason })
}

// ── Admin endpoints ──

async function handleAdmin(request: Request, env: Env, pathname: string): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth || auth.role !== "admin") {
    return jsonResponse({ error: "Admin access required" }, 403)
  }

  // GET /api/admin/users
  if (pathname === "/api/admin/users" && request.method === "GET") {
    const res = await supabaseRest(env, "profiles?select=id,email,username,role,created_at&order=created_at.desc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch users" }, 500)
    return jsonResponse(await res.json())
  }

  // POST /api/admin/approve
  if (pathname === "/api/admin/approve" && request.method === "POST") {
    const body = await request.json<{ userId: string; role?: string }>()
    const role = body.role || "editor"
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role })
    if (!res.ok) return jsonResponse({ error: "Failed to update role" }, 500)
    return jsonResponse({ ok: true })
  }

  // POST /api/admin/revoke
  if (pathname === "/api/admin/revoke" && request.method === "POST") {
    const body = await request.json<{ userId: string }>()
    const res = await supabaseRest(env, `profiles?id=eq.${body.userId}`, "PATCH", { role: "none" })
    if (!res.ok) return jsonResponse({ error: "Failed to revoke" }, 500)
    return jsonResponse({ ok: true })
  }

  // GET /api/admin/log
  if (pathname === "/api/admin/log" && request.method === "GET") {
    const res = await supabaseRest(env, "edit_log?select=id,slug,pr_url,created_at,user_id&order=created_at.desc&limit=50")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch log" }, 500)
    return jsonResponse(await res.json())
  }

  // GET /api/admin/locks
  if (pathname === "/api/admin/locks" && request.method === "GET") {
    const res = await supabaseRest(env, "page_locks?select=slug,reason,locked_at,locked_by&order=locked_at.desc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch locks" }, 500)
    return jsonResponse(await res.json())
  }

  // POST /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "POST") {
    const body = await request.json<{ slug: string; reason?: string }>()
    if (!body.slug?.trim()) return jsonResponse({ error: "Slug required" }, 400)
    const res = await supabaseRest(env, "page_locks", "POST", {
      slug: body.slug.trim(),
      reason: body.reason || null,
      locked_by: auth.id,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to lock page" }, 500)
    return jsonResponse({ ok: true })
  }

  // DELETE /api/admin/lock
  if (pathname === "/api/admin/lock" && request.method === "DELETE") {
    const body = await request.json<{ slug: string }>()
    if (!body.slug?.trim()) return jsonResponse({ error: "Slug required" }, 400)
    const res = await supabaseRest(env, `page_locks?slug=eq.${encodeURIComponent(body.slug.trim())}`, "DELETE")
    if (!res.ok) return jsonResponse({ error: "Failed to unlock page" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}

function addSecurityHeaders(headers: Headers) {
  // CSP: allow own origin, Google Fonts, Turnstile, Supabase, external images
  headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join("; "))
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  headers.set("Cross-Origin-Opener-Policy", "same-origin")
  headers.set("X-Frame-Options", "DENY")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // API routes
    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env)
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return handleAuthMe(request, env)
    }
    if (url.pathname === "/api/edit" && request.method === "POST") {
      return handleEdit(request, env)
    }
    if (url.pathname === "/api/new" && request.method === "POST") {
      return handleNew(request, env)
    }
    if (url.pathname === "/api/lock-status" && request.method === "GET") {
      return handleLockStatus(request, env)
    }
    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url.pathname)
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

    const injected = meta
      ? injectMetaTags(html, meta, slug, url.origin)
      : injectMetaTags(html, {}, slug, url.origin)

    const headers = new Headers(response.headers)
    addSecurityHeaders(headers)

    return new Response(injected, { status: response.status, headers })
  },
} satisfies ExportedHandler<Env>
