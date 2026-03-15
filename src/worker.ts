interface Env {
  ASSETS?: Fetcher
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  KLIPY_API_KEY?: string
}

interface NoteMeta {
  title?: string
  description?: string
  excerpt?: string
  image?: string
  cover?: string
  poster?: string
  username?: string  // chatter pages carry the chat username
}

// In-memory cache — survives for the lifetime of the Worker instance
let contentIndexCache: Record<string, NoteMeta> | null = null

async function getContentIndex(assetsFetcher: Fetcher | undefined): Promise<Record<string, NoteMeta>> {
  if (!assetsFetcher) return {};
  if (contentIndexCache) return contentIndexCache
  try {
    const res = await assetsFetcher.fetch("https://assets.internal/content-index.json")
    if (res.ok) contentIndexCache = await res.json()
  } catch {}
  return contentIndexCache ?? {}
}

// Look up a chatter page image by username (case-insensitive match on frontmatter `username`)
function chatterImageForUsername(index: Record<string, NoteMeta>, username: string): string | null {
  const lower = username.toLowerCase()
  for (const meta of Object.values(index)) {
    if (meta.username?.toLowerCase() === lower && meta.image) {
      return meta.image
    }
  }
  return null
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

interface ProfileData {
  role: string
  username: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  name_color: string | null
}

interface AuthUser {
  id: string
  role: string
  email: string
  username: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  name_color: string | null
}

async function verifyAuth(request: Request, env: Env): Promise<AuthUser | null> {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ") || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null

  const token = authHeader.slice(7)

  // Verify the JWT by calling Supabase auth
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_KEY },
  })
  if (!userRes.ok) return null
  const user = await userRes.json<{ id: string; email: string }>()

  // Fetch profile from profiles table
  const profileRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,username,bio,avatar_url,created_at,name_color`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!profileRes.ok) return null
  const profiles = await profileRes.json<ProfileData[]>()
  const profile = profiles?.[0]

  // Auto-create profile if none exists (first login after magic link)
  if (!profile) {
    await supabaseRest(env, "profiles", "POST", {
      id: user.id, email: user.email, role: "pending",
    })
    return { id: user.id, role: "pending", email: user.email, username: null, bio: null, avatar_url: null, created_at: null, name_color: null }
  }

  return {
    id: user.id,
    role: profile.role ?? "pending",
    email: user.email,
    username: profile.username,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    created_at: profile.created_at,
    name_color: profile.name_color ?? null,
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

  // Chatter image fallback: if no avatar_url set, check for a wiki chatter page
  let avatar_url = auth.avatar_url
  if (!avatar_url && auth.username) {
    const index = await getContentIndex(env.ASSETS)
    avatar_url = chatterImageForUsername(index, auth.username)
  }

  return jsonResponse({
    role: auth.role,
    email: auth.email,
    username: auth.username,
    bio: auth.bio,
    avatar_url,
    created_at: auth.created_at,
    name_color: auth.name_color,
  })
}

// ── PUT /api/auth/profile ──

async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  let body: Record<string, any>
  try { body = await request.json() } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  const updates: Record<string, string> = {}
  if (typeof body.username === "string") {
    const username = body.username.trim()
    if (username && !/^[a-zA-Z0-9-]{3,30}$/.test(username)) {
      return jsonResponse({ error: "Username must be 3-30 chars, alphanumeric and hyphens only" }, 400)
    }
    if (username) {
      // Check uniqueness
      const checkRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&id=neq.${auth.id}&select=id`)
      if (checkRes.ok) {
        const existing = await checkRes.json<{ id: string }[]>()
        if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409)
      }
      updates.username = username
    }
  }
  if (typeof body.bio === "string") updates.bio = body.bio.slice(0, 500)
  if (typeof body.avatar_url === "string") updates.avatar_url = body.avatar_url.slice(0, 500)
  if (body.name_color !== undefined) {
    if (body.name_color === null || body.name_color === "") {
      updates.name_color = null as any
    } else if (typeof body.name_color === "string") {
      const color = body.name_color.trim()
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
        return jsonResponse({ error: "name_color must be a valid hex color (#RRGGBB)" }, 400)
      }
      updates.name_color = color
    }
  }

  if (Object.keys(updates).length === 0) return jsonResponse({ error: "No fields to update" }, 400)

  const res = await supabaseRest(env, `profiles?id=eq.${auth.id}`, "PATCH", updates)
  if (!res.ok) return jsonResponse({ error: "Failed to update profile" }, 500)

  return jsonResponse({ ok: true, ...updates })
}

// ── POST /api/profile/avatar ──

async function handleAvatarUpload(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  const contentType = request.headers.get("Content-Type") ?? ""
  if (!contentType.startsWith("image/")) {
    return jsonResponse({ error: "File must be an image" }, 400)
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  const mimeType = contentType.split(";")[0].trim()
  if (!allowed.includes(mimeType)) {
    return jsonResponse({ error: "Allowed types: JPEG, PNG, WebP, GIF" }, 400)
  }

  const body = await request.arrayBuffer()
  if (body.byteLength > 2 * 1024 * 1024) {
    return jsonResponse({ error: "File too large — maximum 2 MB" }, 413)
  }

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "gif"
  const path = `${auth.id}.${ext}`

  // Upload to Supabase Storage (upsert — replaces any previous avatar)
  const uploadRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/avatars/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        apikey: env.SUPABASE_SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body,
    }
  )
  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    console.error("Avatar upload error:", err)
    return jsonResponse({ error: "Failed to upload image" }, 500)
  }

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/avatars/${path}`

  // Persist URL to profile
  const patchRes = await supabaseRest(env, `profiles?id=eq.${auth.id}`, "PATCH", { avatar_url: publicUrl })
  if (!patchRes.ok) return jsonResponse({ error: "Failed to save avatar URL" }, 500)

  return jsonResponse({ ok: true, avatar_url: publicUrl })
}

// ── POST /api/auth/register ──

async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: Record<string, any>
  try { body = await request.json() } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  const email = (body.email as string)?.trim()
  const username = (body.username as string)?.trim()

  if (!email) return jsonResponse({ error: "Email is required" }, 400)
  if (!username || !/^[a-zA-Z0-9-]{3,30}$/.test(username)) {
    return jsonResponse({ error: "Username must be 3-30 chars, alphanumeric and hyphens only" }, 400)
  }

  // Check username uniqueness
  const checkRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (checkRes.ok) {
    const existing = await checkRes.json<{ id: string }[]>()
    if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409)
  }

  // Return success — client will trigger magic link and store username in localStorage
  // On first /api/auth/me call after login, the profile is auto-created.
  // The username will be set via /api/auth/profile after the magic link confirms.
  return jsonResponse({ ok: true })
}

// ── GET /api/user/:username ──

async function handleUserProfile(env: Env, username: string): Promise<Response> {
  // Fetch profile by username
  const profileRes = await supabaseRest(
    env,
    `profiles?username=eq.${encodeURIComponent(username)}&select=id,username,role,bio,avatar_url,created_at,name_color`
  )
  if (!profileRes.ok) return jsonResponse({ error: "Failed to fetch profile" }, 500)
  const profiles = await profileRes.json<(ProfileData & { id: string })[]>()
  if (!profiles.length) return jsonResponse({ error: "User not found" }, 404)

  const profile = profiles[0]

  // Chatter image fallback
  let avatar_url = profile.avatar_url
  if (!avatar_url) {
    const index = await getContentIndex(env.ASSETS)
    avatar_url = chatterImageForUsername(index, username)
  }

  // Fetch edit history
  const logRes = await supabaseRest(
    env,
    `edit_log?user_id=eq.${profile.id}&select=slug,pr_url,edit_summary,created_at&order=created_at.desc&limit=50`
  )
  const edits = logRes.ok ? await logRes.json<{ slug: string; pr_url: string; edit_summary: string | null; created_at: string }[]>() : []

  return jsonResponse({
    username: profile.username,
    role: profile.role,
    bio: profile.bio,
    avatar_url,
    created_at: profile.created_at,
    name_color: profile.name_color ?? null,
    edits,
    editCount: edits.length,
  })
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
      return await createEditPR(gh, env, auth, altData.path, altData.sha, body.content, slug, body.editSummary)
    }
    const fileData = await fileRes.json<{ sha: string; path: string }>()
    return await createEditPR(gh, env, auth, fileData.path, fileData.sha, body.content, slug, body.editSummary)
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
  editSummary?: string,
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
    message: editSummary ? `wiki: edit ${slug} — ${editSummary}` : `wiki: edit ${slug}`,
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
    body: `Edit to **${slug}** by ${auth.email}.${editSummary ? `\n\n**Summary:** ${editSummary}` : ""}\n\nSubmitted via wiki editor.`,
  })
  if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
  const { html_url } = await prRes.json<{ html_url: string }>()

  // Log the edit
  await supabaseRest(env, "edit_log", "POST", {
    slug, user_id: auth.id, pr_url: html_url, edit_summary: editSummary || null,
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
      body: `New wiki article: **${body.title}** (${body.articleType || "misc"}) by ${auth.email}.${body.editSummary ? `\n\n**Summary:** ${body.editSummary}` : ""}\n\nSubmitted via wiki editor.`,
    })
    if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
    const { html_url } = await prRes.json<{ html_url: string }>()

    // Log the creation
    const slug = filePath.replace(/^content\//, "").replace(/\.md$/, "")
    await supabaseRest(env, "edit_log", "POST", {
      slug, user_id: auth.id, pr_url: html_url, edit_summary: body.editSummary || null,
    })

    return jsonResponse({ prUrl: html_url })
  } catch (err) {
    console.error("New article error:", err)
    return jsonResponse({ error: "Failed to create article" }, 500)
  }
}

// ── Bookmark endpoints ──

async function handleBookmarks(request: Request, env: Env, pathname: string): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  // GET /api/bookmarks — list own bookmarks
  if (pathname === "/api/bookmarks" && request.method === "GET") {
    const res = await supabaseRest(env, `bookmarks?user_id=eq.${auth.id}&select=slug,title,added_at&order=added_at.desc`)
    if (!res.ok) return jsonResponse({ error: "Failed to fetch bookmarks" }, 500)
    return jsonResponse(await res.json())
  }

  // POST /api/bookmarks — add bookmark
  if (pathname === "/api/bookmarks" && request.method === "POST") {
    let body: { slug?: string; title?: string }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid body" }, 400) }
    if (!body.slug?.trim() || !body.title?.trim()) return jsonResponse({ error: "slug and title required" }, 400)
    const res = await supabaseRest(env, "bookmarks", "POST", {
      user_id: auth.id, slug: body.slug.trim(), title: body.title.trim(),
    })
    if (!res.ok) {
      // 409 = already exists (UNIQUE constraint) — treat as success
      if (res.status === 409) return jsonResponse({ ok: true })
      return jsonResponse({ error: "Failed to add bookmark" }, 500)
    }
    return jsonResponse({ ok: true })
  }

  // DELETE /api/bookmarks/:slug — remove bookmark
  if (pathname.startsWith("/api/bookmarks/") && request.method === "DELETE") {
    const slug = decodeURIComponent(pathname.slice("/api/bookmarks/".length))
    const res = await supabaseRest(env, `bookmarks?user_id=eq.${auth.id}&slug=eq.${encodeURIComponent(slug)}`, "DELETE")
    if (!res.ok) return jsonResponse({ error: "Failed to remove bookmark" }, 500)
    return jsonResponse({ ok: true })
  }

  // POST /api/bookmarks/migrate — bulk-import from localStorage on first login
  if (pathname === "/api/bookmarks/migrate" && request.method === "POST") {
    let body: { bookmarks?: { slug: string; title: string; addedAt: string }[] }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid body" }, 400) }
    if (!Array.isArray(body.bookmarks)) return jsonResponse({ error: "bookmarks array required" }, 400)
    const valid = body.bookmarks.filter((b) => b.slug?.trim() && b.title?.trim()).slice(0, 200)
    // Upsert all — ignore conflicts
    for (const b of valid) {
      await supabaseRest(env, "bookmarks", "POST", {
        user_id: auth.id, slug: b.slug.trim(), title: b.title.trim(),
      })
    }
    return jsonResponse({ ok: true, migrated: valid.length })
  }

  return jsonResponse({ error: "Not found" }, 404)
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

  // GET /api/admin/stonk-config
  if (pathname === "/api/admin/stonk-config" && request.method === "GET") {
    const res = await supabaseRest(env, "stonk_config?select=key,value&order=key.asc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch stonk config" }, 500)
    return jsonResponse(await res.json())
  }

  // PUT /api/admin/stonk-config
  if (pathname === "/api/admin/stonk-config" && request.method === "PUT") {
    const body = await request.json<{ key: string; value: number }>()
    if (!body.key?.trim() || typeof body.value !== "number") {
      return jsonResponse({ error: "key and numeric value required" }, 400)
    }
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/stonk_config?key=eq.${encodeURIComponent(body.key.trim())}`, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ value: body.value }),
    })
    if (!res.ok) return jsonResponse({ error: "Failed to update stonk config" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Not found" }, 404)
}

// ── Chat helpers ──

interface ChatMessage {
  id: string
  room_id: string
  user_id: string
  body: string
  reply_to: string | null
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
  profiles: { username: string | null; avatar_url: string | null } | null
}

interface BanProfile {
  ban_type: string | null
  ban_expires_at: string | null
  ban_reason: string | null
}

async function checkBanStatus(env: Env, userId: string): Promise<{ banned: boolean; reason?: string }> {
  const res = await supabaseRest(env, `profiles?id=eq.${userId}&select=ban_type,ban_expires_at,ban_reason`)
  if (!res.ok) return { banned: false }
  const rows = await res.json<BanProfile[]>()
  const profile = rows[0]
  if (!profile || !profile.ban_type || profile.ban_type === "none") return { banned: false }
  if (profile.ban_type === "temporary" && profile.ban_expires_at) {
    if (new Date(profile.ban_expires_at) <= new Date()) return { banned: false }
  }
  return { banned: true, reason: profile.ban_reason ?? undefined }
}

// ── GET/POST /api/chat/rooms ──

async function handleChatRooms(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const auth = await verifyAuth(request, env)
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
    const res = await supabaseRest(env, "rooms?archived=eq.false&select=id,name,slug,created_at,created_by&order=name.asc")
    if (!res.ok) return jsonResponse({ error: "Failed to fetch rooms" }, 500)
    const rooms = await res.json<unknown[]>()
    return jsonResponse({ rooms })
  }

  if (request.method === "POST") {
    const auth = await verifyAuth(request, env)
    if (!auth || auth.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403)

    let body: { name?: string; slug?: string }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.name?.trim() || !body.slug?.trim()) return jsonResponse({ error: "name and slug required" }, 400)

    const res = await supabaseRest(env, "rooms", "POST", {
      id: body.slug.trim(),
      name: body.name.trim(),
      slug: body.slug.trim(),
      created_by: auth.id,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to create room" }, 500)
    return jsonResponse(await res.json(), 201)
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

// ── GET /api/chat/messages — list, DELETE /api/chat/messages/:id — soft delete ──

async function handleChatMessages(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  // DELETE /api/chat/messages/:id
  if (request.method === "DELETE") {
    const id = url.pathname.split("/").pop()
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)

    const fetchRes = await supabaseRest(env, `messages?id=eq.${id}&select=id,user_id,deleted_at`)
    if (!fetchRes.ok) return jsonResponse({ error: "Failed to fetch message" }, 500)
    const rows = await fetchRes.json<{ id: string; user_id: string; deleted_at: string | null }[]>()
    if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
    const msg = rows[0]
    if (msg.deleted_at) return jsonResponse({ error: "Already deleted" }, 409)
    if (msg.user_id !== auth.id && auth.role !== "admin") {
      return jsonResponse({ error: "Forbidden" }, 403)
    }

    const delRes = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      deleted_at: new Date().toISOString(),
      deleted_by: auth.id,
    })
    if (!delRes.ok) return jsonResponse({ error: "Failed to delete message" }, 500)
    return jsonResponse({ ok: true })
  }

  // PATCH /api/chat/messages/:id — edit own message
  if (request.method === "PATCH") {
    const id = url.pathname.split("/").pop()
    if (!id) return jsonResponse({ error: "Message ID required" }, 400)

    let payload: { body?: string }
    try { payload = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    const newBody = payload.body?.trim()
    if (!newBody) return jsonResponse({ error: "body required" }, 400)
    if (newBody.length > 2000) return jsonResponse({ error: "Message too long" }, 400)

    const fetchRes = await supabaseRest(env, `messages?id=eq.${id}&select=id,user_id,deleted_at`)
    if (!fetchRes.ok) return jsonResponse({ error: "Failed to fetch message" }, 500)
    const rows = await fetchRes.json<{ id: string; user_id: string; deleted_at: string | null }[]>()
    if (!rows.length) return jsonResponse({ error: "Message not found" }, 404)
    const msg = rows[0]
    if (msg.deleted_at) return jsonResponse({ error: "Message is deleted" }, 409)
    if (msg.user_id !== auth.id) return jsonResponse({ error: "Forbidden" }, 403)

    const editRes = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      body: newBody,
      edited_at: new Date().toISOString(),
    })
    if (!editRes.ok) return jsonResponse({ error: "Failed to edit message" }, 500)
    return jsonResponse({ ok: true })
  }

  // POST /api/chat/messages — send a message
  if (request.method === "POST") {
    const ban = await checkBanStatus(env, auth.id)
    if (ban.banned) return jsonResponse({ error: ban.reason ?? "You are banned" }, 403)

    let body: { room_id?: string; body?: string; reply_to?: string | null }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
    if (!body.room_id?.trim() || !body.body?.trim()) return jsonResponse({ error: "room_id and body required" }, 400)
    if (body.body.trim().length > 2000) return jsonResponse({ error: "Message too long" }, 400)

    const res = await supabaseRest(env, "messages", "POST", {
      room_id: body.room_id.trim(),
      user_id: auth.id,
      body: body.body.trim(),
      reply_to: body.reply_to ?? null,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to send message" }, 500)
    return jsonResponse({ ok: true }, 201)
  }

  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const room = url.searchParams.get("room")
  if (!room) return jsonResponse({ error: "room parameter required" }, 400)

  const before = url.searchParams.get("before")
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100)

  let filter = `room_id=eq.${encodeURIComponent(room)}&deleted_at=is.null`
  if (before) filter += `&created_at=lt.${encodeURIComponent(before)}`
  filter += `&order=created_at.desc&limit=${limit}`

  const res = await supabaseRest(env, `messages?${filter}&select=*,profiles!messages_user_id_fkey(username,avatar_url,name_color)`)
  if (!res.ok) return jsonResponse({ error: "Failed to fetch messages" }, 500)
  const messages = await res.json<ChatMessage[]>()

  // Fetch reply_to snapshots for any messages that reference another
  const replyIds = [...new Set(messages.map(m => m.reply_to).filter((id): id is string => id !== null))]
  let replyMap: Record<string, Pick<ChatMessage, "id" | "body" | "profiles">> = {}
  if (replyIds.length > 0) {
    const idsFilter = replyIds.map(id => encodeURIComponent(id)).join(",")
    const replyRes = await supabaseRest(env, `messages?id=in.(${idsFilter})&select=id,body,profiles!messages_user_id_fkey(username,avatar_url,name_color)`)
    if (replyRes.ok) {
      const replyRows = await replyRes.json<Pick<ChatMessage, "id" | "body" | "profiles">[]>()
      for (const r of replyRows) replyMap[r.id] = r
    }
  }

  // Fetch reactions for all messages in one query
  const msgIds = messages.map(m => m.id)
  let reactionsMap: Record<string, { emote: string; user_id: string }[]> = {}
  if (msgIds.length > 0) {
    const idsFilter = msgIds.map(id => encodeURIComponent(id)).join(",")
    const reactRes = await supabaseRest(env, `reactions?message_id=in.(${idsFilter})&select=message_id,emote,user_id`)
    if (reactRes.ok) {
      const reactRows = await reactRes.json<{ message_id: string; emote: string; user_id: string }[]>()
      for (const r of reactRows) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = []
        reactionsMap[r.message_id].push({ emote: r.emote, user_id: r.user_id })
      }
    }
  }

  const enriched = messages.map(m => {
    const rawReacts = reactionsMap[m.id] ?? []
    // Group by emote, count, mark if current user reacted
    const byEmote: Record<string, { count: number; reacted: boolean }> = {}
    for (const r of rawReacts) {
      if (!byEmote[r.emote]) byEmote[r.emote] = { count: 0, reacted: false }
      byEmote[r.emote].count++
      if (r.user_id === auth.id) byEmote[r.emote].reacted = true
    }
    const reactions = Object.entries(byEmote).map(([emote, v]) => ({ emote, ...v }))
    return {
      ...m,
      reply_to_message: m.reply_to ? (replyMap[m.reply_to] ?? null) : null,
      reactions,
    }
  })

  return jsonResponse({ messages: enriched, has_more: messages.length === limit })
}

// ── POST/DELETE /api/chat/reactions ──

async function handleChatReactions(request: Request, env: Env): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  let body: { message_id?: string; emote?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.message_id?.trim() || !body.emote?.trim()) {
    return jsonResponse({ error: "message_id and emote required" }, 400)
  }

  if (request.method === "POST") {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/reactions`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ message_id: body.message_id.trim(), user_id: auth.id, emote: body.emote.trim() }),
    })
    if (!res.ok) return jsonResponse({ error: "Failed to add reaction" }, 500)
    // Fire-and-forget stonk processing
    processStonkReaction(env, body.message_id.trim(), body.emote.trim(), auth.id, false).catch(() => {})
    return jsonResponse({ ok: true })
  }

  if (request.method === "DELETE") {
    const res = await supabaseRest(
      env,
      `reactions?message_id=eq.${encodeURIComponent(body.message_id.trim())}&user_id=eq.${auth.id}&emote=eq.${encodeURIComponent(body.emote.trim())}`,
      "DELETE",
    )
    if (!res.ok) return jsonResponse({ error: "Failed to remove reaction" }, 500)
    // Fire-and-forget stonk reversal
    processStonkReaction(env, body.message_id.trim(), body.emote.trim(), auth.id, true).catch(() => {})
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

// ── GET /api/chat/search ──

async function handleChatSearch(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  const q = url.searchParams.get("q")?.trim()
  if (!q) return jsonResponse({ error: "q parameter required" }, 400)

  const room = url.searchParams.get("room")
  const user = url.searchParams.get("user")
  const before = url.searchParams.get("before")
  const after = url.searchParams.get("after")
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10)
  const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100)

  const parts: string[] = [
    `body=ilike.*${encodeURIComponent(q)}*`,
    "deleted_at=is.null",
    `order=created_at.desc`,
    `limit=${limit}`,
  ]
  if (room) parts.push(`room_id=eq.${encodeURIComponent(room)}`)
  if (before) parts.push(`created_at=lt.${encodeURIComponent(before)}`)
  if (after) parts.push(`created_at=gt.${encodeURIComponent(after)}`)

  let filter = parts.join("&")

  // If filtering by username, we need a different approach: join and filter
  // PostgREST can filter on embedded resources with a special syntax:
  if (user) filter += `&profiles.username=eq.${encodeURIComponent(user)}`

  const res = await supabaseRest(env, `messages?${filter}&select=*,profiles!messages_user_id_fkey(username,avatar_url,name_color)`)
  if (!res.ok) return jsonResponse({ error: "Search failed" }, 500)
  const messages = await res.json<ChatMessage[]>()

  // If user filter was applied, PostgREST doesn't filter by embedded resource natively in all versions,
  // so additionally filter client-side for safety
  const filtered = user
    ? messages.filter(m => m.profiles?.username?.toLowerCase() === user.toLowerCase())
    : messages

  return jsonResponse({ messages: filtered })
}

// ── GET /api/chat/pins?room=X — POST/DELETE /api/chat/messages/:id/pin ──

async function handleChatPins(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)

  // GET /api/chat/pins?room=X — list pinned messages for a room
  if (request.method === "GET") {
    const room = url.searchParams.get("room")
    if (!room) return jsonResponse({ error: "room parameter required" }, 400)

    const res = await supabaseRest(
      env,
      `messages?room_id=eq.${encodeURIComponent(room)}&pinned_at=not.is.null&deleted_at=is.null&order=pinned_at.desc&limit=20&select=id,body,pinned_at,pinned_by,profiles!messages_user_id_fkey(username,avatar_url,name_color)`
    )
    if (!res.ok) return jsonResponse({ error: "Failed to fetch pins" }, 500)
    const pins = await res.json()
    return jsonResponse({ pins })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

async function handleChatPin(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = await verifyAuth(request, env)
  if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
  if (auth.role !== "admin") return jsonResponse({ error: "Admin only" }, 403)

  const id = url.pathname.split("/")[4] // /api/chat/messages/:id/pin
  if (!id) return jsonResponse({ error: "Message ID required" }, 400)

  if (request.method === "POST") {
    const res = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      pinned_at: new Date().toISOString(),
      pinned_by: auth.id,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to pin message" }, 500)
    return jsonResponse({ ok: true })
  }

  if (request.method === "DELETE") {
    const res = await supabaseRest(env, `messages?id=eq.${id}`, "PATCH", {
      pinned_at: null,
      pinned_by: null,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to unpin message" }, 500)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: "Method not allowed" }, 405)
}

// ── Stonk helpers ──

async function getStonkConfig(env: Env): Promise<Record<string, number>> {
  const res = await supabaseRest(env, "stonk_config?select=key,value")
  if (!res.ok) return {}
  const rows = await res.json<{ key: string; value: number }[]>()
  const config: Record<string, number> = {}
  for (const r of rows) config[r.key] = r.value
  return config
}

async function writeStonkLedger(
  env: Env,
  userId: string,
  amount: number,
  reason: string,
  sourceType: string,
  sourceId: string,
) {
  // Clamp: don't write if it would take balance below 0
  // Check current balance first
  const balRes = await supabaseRest(env, `stonk_balance?user_id=eq.${userId}&select=balance`)
  const balRows = await balRes.json<{ balance: number }[]>().catch(() => [] as { balance: number }[])
  const currentBalance = balRows.length > 0 ? balRows[0].balance : 0
  if (currentBalance + amount < 0) {
    // Clamp: only debit what they have
    amount = -currentBalance
  }
  if (amount === 0) return

  await supabaseRest(env, "stonk_ledger", "POST", {
    user_id: userId,
    amount,
    reason,
    source_type: sourceType,
    source_id: sourceId,
  })
}

async function processStonkReaction(
  env: Env,
  messageId: string,
  emote: string,
  reactorId: string,
  isDelete: boolean,
) {
  const config = await getStonkConfig(env)
  if (!config.stonks_enabled) return

  // Look up the message author
  const msgRes = await supabaseRest(env, `messages?id=eq.${messageId}&select=user_id`)
  if (!msgRes.ok) return
  const msgs = await msgRes.json<{ user_id: string }[]>()
  if (!msgs.length) return
  const authorId = msgs[0].user_id

  // No self-stonking
  if (reactorId === authorId) return

  const sourceId = `${messageId}:${reactorId}:${emote}`

  if (isDelete) {
    // Reversal: look up original ledger entries by source_id and negate them
    const ledgerRes = await supabaseRest(env, `stonk_ledger?source_id=eq.${encodeURIComponent(sourceId)}&select=user_id,amount,source_type`)
    if (!ledgerRes.ok) return
    const entries = await ledgerRes.json<{ user_id: string; amount: number; source_type: string }[]>()
    // Sum amounts per user to get net, then insert reversal
    const netByUser: Record<string, { amount: number; sourceType: string }> = {}
    for (const e of entries) {
      const key = `${e.user_id}:${e.source_type}`
      if (!netByUser[key]) netByUser[key] = { amount: 0, sourceType: e.source_type }
      netByUser[key].amount += e.amount
    }
    for (const [key, val] of Object.entries(netByUser)) {
      if (val.amount === 0) continue
      const userId = key.split(":")[0]
      await supabaseRest(env, "stonk_ledger", "POST", {
        user_id: userId,
        amount: -val.amount,
        reason: `reversal: ${emote} reaction removed`,
        source_type: val.sourceType,
        source_id: sourceId,
      })
    }
    return
  }

  // Add reaction: credit the author
  const receivedKey = `${emote}_received`
  const receivedAmount = config[receivedKey] ?? config.reaction_received_default ?? 0
  if (receivedAmount !== 0) {
    await writeStonkLedger(env, authorId, receivedAmount, `received ${emote} reaction`, "reaction_received", sourceId)
  }

  // For nahh: also debit the reactor
  if (emote === "nahh") {
    const givenAmount = config.nahh_given ?? 0
    if (givenAmount !== 0) {
      await writeStonkLedger(env, reactorId, givenAmount, `gave nahh reaction`, "reaction_given", sourceId)
    }
  }
}

// ── GET /api/chat/users/:username/stonk-history ──

async function handleStonkHistory(request: Request, env: Env, username: string): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  // Check if stonks enabled
  const config = await getStonkConfig(env)
  if (!config.stonks_enabled) return jsonResponse({ days: [] })

  // Look up user_id from username
  const userRes = await supabaseRest(env, `profiles?username=eq.${encodeURIComponent(username)}&select=id`)
  if (!userRes.ok) return jsonResponse({ error: "Failed to fetch user" }, 500)
  const users = await userRes.json<{ id: string }[]>()
  if (!users.length) return jsonResponse({ error: "User not found" }, 404)
  const userId = users[0].id

  // Get last 90 days of ledger entries
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const ledgerRes = await supabaseRest(
    env,
    `stonk_ledger?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}&select=amount,created_at&order=created_at.asc`
  )
  if (!ledgerRes.ok) return jsonResponse({ error: "Failed to fetch history" }, 500)
  const entries = await ledgerRes.json<{ amount: number; created_at: string }[]>()

  // Get balance before the 90-day window for running total
  const preRes = await supabaseRest(
    env,
    `stonk_ledger?user_id=eq.${userId}&created_at=lt.${encodeURIComponent(since)}&select=amount`
  )
  let preBalance = 0
  if (preRes.ok) {
    const preEntries = await preRes.json<{ amount: number }[]>()
    preBalance = preEntries.reduce((sum, e) => sum + e.amount, 0)
  }

  // Aggregate by day
  const dailyDeltas: Record<string, number> = {}
  for (const e of entries) {
    const day = e.created_at.slice(0, 10) // YYYY-MM-DD
    dailyDeltas[day] = (dailyDeltas[day] ?? 0) + e.amount
  }

  // Build running sum
  const sortedDays = Object.keys(dailyDeltas).sort()
  let running = Math.max(preBalance, 0)
  const days = sortedDays.map(date => {
    running = Math.max(running + dailyDeltas[date], 0)
    return { date, balance: running }
  })

  return jsonResponse({ days })
}

// ── GET /api/chat/users/:username/mini ──

async function handleChatUserMini(request: Request, env: Env, username: string): Promise<Response> {
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405)

  const res = await supabaseRest(
    env,
    `profiles?username=eq.${encodeURIComponent(username)}&select=id,username,avatar_url,role,bio,created_at,name_color`,
  )
  if (!res.ok) return jsonResponse({ error: "Failed to fetch user" }, 500)
  const rows = await res.json<{ id: string; username: string; avatar_url: string | null; role: string; bio: string | null; created_at: string | null; name_color: string | null }[]>()
  if (!rows.length) return jsonResponse({ error: "User not found" }, 404)
  const row = rows[0]
  if (!row.avatar_url) {
    const index = await getContentIndex(env.ASSETS)
    row.avatar_url = chatterImageForUsername(index, username)
  }

  // Stonk balance
  const config = await getStonkConfig(env)
  let stonk_balance: number | null = null
  if (config.stonks_enabled) {
    const balRes = await supabaseRest(env, `stonk_balance?user_id=eq.${row.id}&select=balance`)
    if (balRes.ok) {
      const balRows = await balRes.json<{ balance: number }[]>()
      stonk_balance = balRows.length > 0 ? balRows[0].balance : 0
    }
  }

  const { id: _id, ...rest } = row
  return jsonResponse({ ...rest, stonk_balance })
}

// ── POST /api/chat/ban — POST /api/chat/unban ──

async function handleChatBan(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const auth = await verifyAuth(request, env)
  if (!auth || auth.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403)

  const url = new URL(request.url)
  const isBan = url.pathname === "/api/chat/ban"

  let body: { user_id?: string; type?: string; duration_hours?: number; reason?: string }
  try { body = await request.json() } catch { return jsonResponse({ error: "Invalid request body" }, 400) }
  if (!body.user_id?.trim()) return jsonResponse({ error: "user_id required" }, 400)

  if (isBan) {
    if (!body.type || (body.type !== "temporary" && body.type !== "permanent")) {
      return jsonResponse({ error: "type must be 'temporary' or 'permanent'" }, 400)
    }
    const ban_expires_at = body.type === "temporary" && body.duration_hours
      ? new Date(Date.now() + body.duration_hours * 3600000).toISOString()
      : null
    const res = await supabaseRest(env, `profiles?id=eq.${body.user_id.trim()}`, "PATCH", {
      ban_type: body.type,
      ban_expires_at,
      ban_reason: body.reason ?? null,
    })
    if (!res.ok) return jsonResponse({ error: "Failed to ban user" }, 500)
    return jsonResponse({ ok: true })
  }

  // unban
  const res = await supabaseRest(env, `profiles?id=eq.${body.user_id.trim()}`, "PATCH", {
    ban_type: "none",
    ban_expires_at: null,
    ban_reason: null,
  })
  if (!res.ok) return jsonResponse({ error: "Failed to unban user" }, 500)
  return jsonResponse({ ok: true })
}

async function handleGifSearch(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.KLIPY_API_KEY) {
    return jsonResponse({ error: "GIF search not configured" }, 503)
  }
  const q = url.searchParams.get("q") || "trending"
  const klipyUrl = `https://api.klipy.co/api/v1/gifs/search?q=${encodeURIComponent(q)}&limit=20`
  try {
    const res = await fetch(klipyUrl, {
      headers: { Authorization: `Bearer ${env.KLIPY_API_KEY}` },
    })
    if (!res.ok) return jsonResponse({ error: "GIF search failed" }, 502)
    const data = await res.json<{ data?: Array<{ id: string; url: string; preview_url?: string; title?: string }> }>()
    const results = (data.data ?? []).map((g) => ({
      url: g.url,
      preview: g.preview_url ?? g.url,
      title: g.title ?? "",
    }))
    return jsonResponse({ results }, 200)
  } catch {
    return jsonResponse({ error: "GIF search unavailable" }, 502)
  }
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

    // Domain routing — one Worker, three surfaces:
    // garden:  subsurfaces.net        → static assets + OG meta injection
    // wiki:    wiki.subsurfaces.net   → auth, editing, profiles, bookmarks
    // chat:    chat.subsurfaces.net   → realtime, stonks, bans, GIF search

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // Chat API
    if (url.pathname === "/api/chat/rooms") return handleChatRooms(request, env)
    if (url.pathname === "/api/chat/messages") return handleChatMessages(request, env, url)
    if (url.pathname.match(/^\/api\/chat\/messages\/[^/]+\/pin$/)) return handleChatPin(request, env, url)
    if (url.pathname.match(/^\/api\/chat\/messages\/[^/]+$/)) return handleChatMessages(request, env, url)
    if (url.pathname === "/api/chat/pins") return handleChatPins(request, env, url)
    if (url.pathname === "/api/chat/reactions") return handleChatReactions(request, env)
    if (url.pathname === "/api/chat/search") return handleChatSearch(request, env, url)
    if (url.pathname.match(/^\/api\/chat\/users\/[^/]+\/stonk-history$/)) {
      const username = decodeURIComponent(url.pathname.split("/")[4])
      return handleStonkHistory(request, env, username)
    }
    if (url.pathname.match(/^\/api\/chat\/users\/[^/]+\/mini$/)) {
      const username = decodeURIComponent(url.pathname.split("/")[4])
      return handleChatUserMini(request, env, username)
    }
    if (url.pathname === "/api/chat/ban" || url.pathname === "/api/chat/unban") {
      return handleChatBan(request, env)
    }
    if (url.pathname === "/api/chat/gif-search" && request.method === "GET") {
      return handleGifSearch(request, env, url)
    }

    // API routes
    if (url.pathname === "/api/submit" && request.method === "POST") {
      return handleSubmit(request, env)
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      return handleAuthMe(request, env)
    }
    if (url.pathname === "/api/auth/profile" && request.method === "PUT") {
      return handleUpdateProfile(request, env)
    }
    if (url.pathname === "/api/profile/avatar" && request.method === "POST") {
      return handleAvatarUpload(request, env)
    }
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      return handleRegister(request, env)
    }
    if (url.pathname.startsWith("/api/user/") && request.method === "GET") {
      const username = decodeURIComponent(url.pathname.slice("/api/user/".length))
      return handleUserProfile(env, username)
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
    if (url.pathname.startsWith("/api/bookmarks")) {
      return handleBookmarks(request, env, url.pathname)
    }
    if (url.pathname.startsWith("/api/admin/")) {
      return handleAdmin(request, env, url.pathname)
    }

    // In local dev (wrangler.dev.toml), ASSETS is not bound — Vite serves static files
    if (!env.ASSETS) {
      return new Response("Not found (no ASSETS binding in dev)", { status: 404 })
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
