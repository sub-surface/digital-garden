import { Env, ProfileData, RouteCtx } from "./types"
import { CONTENT_REPO, ghApi, jsonResponse, readJson, supabaseRest, upstreamError, verifyTurnstile } from "./lib"
import { getContentIndex, chatterImageForUsername, resolveSlugCaseInsensitive } from "./meta"
import { escapeHtml } from "../lib/escape"

/** Encode a user-supplied scalar as a safe YAML value. JSON strings are valid
 * YAML, so this neutralises quote/newline/key injection into frontmatter —
 * a crafted submission must not be able to add frontmatter keys or break the
 * prebuild parser after the PR merges. */
function yamlStr(value: string): string {
  return JSON.stringify(value.replace(/[\r\n]+/g, " ").trim())
}

/** Make user text inert inside an MDX body. Content files compile as MDX, so a
 * raw `{expr}` or `<Tag>` in a submission is executable JSX once merged — a
 * reviewed PR used to be the only defence. Backslash escapes are valid
 * CommonMark for ASCII punctuation and MDX honours them. */
function mdxText(value: string): string {
  return value.replace(/[\\{}<>]/g, (c) => `\\${c}`)
}

function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function notifyAdmin(env: Env, subject: string, text: string, html: string) {
  if (!env.EMAIL) return
  env.EMAIL.send({
    from: { email: "system@subsurfaces.net", name: "Subsurface Wiki" },
    to: "admin@subsurfaces.net",
    subject,
    text,
    html,
  }).catch((err) => console.error("Email send error:", err))
}

interface PrFile { path: string; base64: string; sha?: string; message: string }

/** Branch off master, commit each file, open a PR. Every wiki write path goes
 * through here. If any step after branch creation fails, the branch is deleted
 * so failed submissions don't accumulate as orphan branches. */
async function openPullRequest(
  env: Env,
  branch: string,
  files: PrFile[],
  pr: { title: string; body: string },
): Promise<string> {
  const gh = ghApi(env)
  const refRes = await gh(`${CONTENT_REPO}/git/ref/heads/master`, "GET")
  if (!refRes.ok) throw new Error(`get ref: ${refRes.status} ${(await refRes.text()).slice(0, 200)}`)
  const { object: { sha: masterSha } } = await refRes.json<{ object: { sha: string } }>()

  const branchRes = await gh(`${CONTENT_REPO}/git/refs`, "POST", { ref: `refs/heads/${branch}`, sha: masterSha })
  if (!branchRes.ok) throw new Error(`create branch: ${branchRes.status} ${(await branchRes.text()).slice(0, 200)}`)

  try {
    for (const f of files) {
      const res = await gh(`${CONTENT_REPO}/contents/${encodeURI(f.path)}`, "PUT", {
        message: f.message, content: f.base64, branch, ...(f.sha ? { sha: f.sha } : {}),
      })
      if (!res.ok) throw new Error(`commit ${f.path}: ${res.status} ${(await res.text()).slice(0, 200)}`)
    }
    const prRes = await gh(`${CONTENT_REPO}/pulls`, "POST", { ...pr, head: branch, base: "master" })
    if (!prRes.ok) throw new Error(`create PR: ${prRes.status} ${(await prRes.text()).slice(0, 200)}`)
    return (await prRes.json<{ html_url: string }>()).html_url
  } catch (err) {
    await gh(`${CONTENT_REPO}/git/refs/heads/${branch}`, "DELETE")
      .catch((e) => console.error(`[wiki] orphan branch cleanup failed for ${branch}:`, e))
    throw err
  }
}

function branchSuffix(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")}`
}

function emailSlug(email: string): string {
  return email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || "editor"
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_CONTENT_CHARS = 200_000

/** Magic-byte check of a base64 image. Returns its extension, or null. */
function sniffImage(base64: string): string | null {
  let head: string
  try { head = atob(base64.slice(0, 16)) } catch { return null }
  const b = (i: number) => head.charCodeAt(i)
  if (b(0) === 0xff && b(1) === 0xd8) return "jpg"
  if (b(0) === 0x89 && b(1) === 0x50) return "png"
  if (head.startsWith("GIF")) return "gif"
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "webp"
  return null
}

const SURVEY_SECTIONS: [string, [string, string][]][] = [
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

export async function handleSubmit({ request, env }: RouteCtx): Promise<Response> {
  if (!env.TURNSTILE_SECRET_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Server misconfiguration" }, 500)
  }

  const body = await readJson<Record<string, unknown>>(request)
  if (body instanceof Response) return body
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "")

  const name = str("name")
  const username = str("username")
  if (!name || !username || !body.turnstileToken) {
    return jsonResponse({ error: "Missing required fields" }, 400)
  }
  if (name.length > 100 || username.length > 60) return jsonResponse({ error: "Name or username too long" }, 400)

  const safeName = username.replace(/^[^a-zA-Z0-9]+/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
  if (!safeName) return jsonResponse({ error: "Username must contain a letter or digit" }, 400)

  // Validate the image before spending a captcha or any GitHub calls on it.
  const imageBase64 = str("imageBase64")
  let imageExt: string | null = null
  if (imageBase64) {
    if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) return jsonResponse({ error: "Image too large — maximum 2 MB" }, 413)
    imageExt = sniffImage(imageBase64)
    if (!imageExt) return jsonResponse({ error: "Image must be JPEG, PNG, GIF or WebP" }, 400)
  }

  if (!(await verifyTurnstile(env, body.turnstileToken, request))) {
    return jsonResponse({ error: "Captcha validation failed" }, 400)
  }

  try {
    const files: PrFile[] = []
    let resolvedImageUrl = /^https:\/\//.test(str("imageUrl")) ? str("imageUrl") : ""
    if (imageBase64 && imageExt) {
      files.push({
        path: `content/Media/Wiki/chatters/${safeName}.${imageExt}`,
        base64: imageBase64,
        message: `wiki: add profile image for ${safeName}`,
      })
      resolvedImageUrl = `/content/Media/Wiki/chatters/${safeName}.${imageExt}`
    }

    const fm = [
      "---",
      `title: ${yamlStr(`${name}'s Profile`)}`,
      `description: ${yamlStr(`Philchat wiki profile for ${name}`)}`,
      "tags: [wiki, chatter]", "type: chatter",
      `username: ${yamlStr(username)}`,
      str("pronouns") ? `pronouns: ${yamlStr(str("pronouns"))}` : null,
      resolvedImageUrl ? `image: ${yamlStr(resolvedImageUrl)}` : null,
      str("tradition") ? `tradition: ${yamlStr(str("tradition"))}` : null,
      str("aos") ? `aos: ${yamlStr(str("aos"))}` : null,
      str("influences") ? `influences: ${yamlStr(str("influences"))}` : null,
      "draft: true", "---",
    ].filter(Boolean).join("\n")

    // Survey answers are single-line list items: a newline would let an answer start
    // its own block (a heading, a fence) and restructure the page.
    const sections = SURVEY_SECTIONS.map(([title, qs]) =>
      `## ${title}\n` + qs.map(([k, l]) => `* **${l}:** ${mdxText(str(k).replace(/\s*\n\s*/g, " ")) || "[no answer]"}`).join("\n")
    ).join("\n\n")

    const notes = str("additionalNotes") ? `\n\n---\n## Additional Notes\n${mdxText(str("additionalNotes"))}` : ""
    const bodySection = str("bodyContent") ? `\n\n${mdxText(str("bodyContent"))}\n\n---\n\n` : ""
    const markdown = `${fm}\n\n# ${mdxText(name)}'s Profile\n\n${bodySection}${sections}${notes}\n`
    if (markdown.length > MAX_CONTENT_CHARS) return jsonResponse({ error: "Submission too long" }, 413)

    files.push({
      path: `content/Wiki/chatters/${safeName}.md`,
      base64: utf8Base64(markdown),
      message: `wiki: add profile submission for ${safeName}`,
    })

    const html_url = await openPullRequest(env, `submit/${safeName}-${branchSuffix()}`, files, {
      title: `Wiki profile: ${safeName}`,
      body: `New wiki profile submission for **${name.replace(/[*_`[\]]/g, "")}** (${safeName}).\n\nSubmitted via wiki.subsurfaces.net/wiki/submit`,
    })

    notifyAdmin(env, `New Profile Submission: ${safeName}`,
      `A new profile has been submitted by ${name} (${safeName}).\n\nReview it here: ${html_url}`,
      `<p>A new profile has been submitted (@${escapeHtml(safeName)}).</p><p><a href="${html_url}">Review Pull Request</a></p>`)

    return jsonResponse({ prUrl: html_url })
  } catch (err) {
    console.error("Submit error:", err)
    return jsonResponse({ error: "Failed to create submission" }, 500)
  }
}

export async function handleUserProfile({ env, match }: RouteCtx): Promise<Response> {
  const username = decodeURIComponent(match[1])
  const profileRes = await supabaseRest(
    env,
    `profiles?username=eq.${encodeURIComponent(username)}&select=id,username,role,bio,avatar_url,created_at,name_color`
  )
  if (!profileRes.ok) return upstreamError("user profile", profileRes, "Failed to fetch profile")
  const profiles = await profileRes.json<(ProfileData & { id: string })[]>()
  if (!profiles.length) return jsonResponse({ error: "User not found" }, 404)

  const profile = profiles[0]

  // Chatter image fallback + edit history are independent — run concurrently.
  const [avatar_url, edits] = await Promise.all([
    (async () => {
      if (profile.avatar_url) return profile.avatar_url
      const index = await getContentIndex(env.ASSETS)
      return chatterImageForUsername(index, username)
    })(),
    (async () => {
      const logRes = await supabaseRest(
        env,
        `edit_log?user_id=eq.${profile.id}&select=slug,pr_url,edit_summary,created_at&order=created_at.desc&limit=50`
      )
      return logRes.ok ? logRes.json<{ slug: string; pr_url: string; edit_summary: string | null; created_at: string }[]>() : []
    })(),
  ])

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

function requireEditor(role: string): Response | null {
  return role === "editor" || role === "admin" ? null : jsonResponse({ error: "Unauthorized" }, 403)
}

async function logEdit(env: Env, slug: string, userId: string, prUrl: string, editSummary: string) {
  const res = await supabaseRest(env, "edit_log", "POST", {
    slug, user_id: userId, pr_url: prUrl, edit_summary: editSummary || null,
  })
  // The PR exists either way; a missing log row is worth a loud log line, not a failed request.
  if (!res.ok) console.error(`[wiki] edit_log insert failed (${res.status}) for ${prUrl}`)
}

export async function handleEdit({ request, env, auth }: RouteCtx): Promise<Response> {
  const denied = requireEditor(auth!.role)
  if (denied) return denied

  const body = await readJson<{ slug: string; content: string; turnstileToken: string; editSummary: string }>(request)
  if (body instanceof Response) return body
  if (typeof body.slug !== "string" || !body.slug.trim() || typeof body.content !== "string" || !body.content.trim()) {
    return jsonResponse({ error: "Missing required fields" }, 400)
  }
  if (body.content.length > MAX_CONTENT_CHARS) return jsonResponse({ error: "Content too long" }, 413)
  const editSummary = typeof body.editSummary === "string" ? body.editSummary.trim().slice(0, 200) : ""

  // Resolve through the content index: the request slug carries whatever casing
  // the visitor's URL had, but GitHub paths are case-sensitive (`wiki/about`
  // used to miss `content/Wiki/About.md`). The index also limits edits to
  // published wiki notes — not essays, private notes, or arbitrary repo paths.
  const index = await getContentIndex(env.ASSETS)
  const slug = resolveSlugCaseInsensitive(index, body.slug.trim())
  const contentPath = slug ? index[slug].contentPath : undefined
  if (!slug || !contentPath || !/^wiki\//i.test(slug)) {
    return jsonResponse({ error: "Only published wiki pages can be edited" }, 404)
  }

  if (!(await verifyTurnstile(env, body.turnstileToken, request))) {
    return jsonResponse({ error: "Captcha validation failed" }, 400)
  }

  // Fails closed: an unreadable lock table must not let edits through to locked pages.
  // Case-insensitive: locks are keyed by whatever casing the admin typed.
  const lockPattern = slug.replace(/[\\%_]/g, (c) => `\\${c}`)
  const lockRes = await supabaseRest(env, `page_locks?slug=ilike.${encodeURIComponent(lockPattern)}&select=slug`)
  if (!lockRes.ok) return upstreamError("page lock check", lockRes, "Could not check page lock")
  if ((await lockRes.json<unknown[]>()).length > 0) return jsonResponse({ error: "This page is locked" }, 403)

  try {
    const filePath = `content/${contentPath}`
    const fileRes = await ghApi(env)(`${CONTENT_REPO}/contents/${encodeURI(filePath)}?ref=master`, "GET")
    if (!fileRes.ok) return upstreamError("edit source lookup", fileRes, "Could not find the source file on GitHub", 404)
    const { sha } = await fileRes.json<{ sha: string }>()

    const html_url = await openPullRequest(env, `edit/${emailSlug(auth!.email)}-${branchSuffix()}`, [{
      path: filePath,
      base64: utf8Base64(body.content),
      sha,
      message: editSummary ? `wiki: edit ${slug} — ${editSummary}` : `wiki: edit ${slug}`,
    }], {
      title: `Wiki edit: ${slug.split("/").pop()?.replace(/-/g, " ")}`,
      body: `Edit to **${slug}** by ${auth!.email}.${editSummary ? `\n\n**Summary:** ${editSummary}` : ""}\n\nSubmitted via wiki editor.`,
    })

    await logEdit(env, slug, auth!.id, html_url, editSummary)
    notifyAdmin(env, `New Wiki Edit: ${slug}`,
      `An edit to ${slug} was submitted by ${auth!.email}.\n\nReview it here: ${html_url}`,
      `<p>An edit to <strong>${escapeHtml(slug)}</strong> was submitted by ${escapeHtml(auth!.email)}.</p><p><a href="${html_url}">Review Pull Request</a></p>`)

    return jsonResponse({ prUrl: html_url })
  } catch (err) {
    console.error("Edit error:", err)
    return jsonResponse({ error: "Failed to create edit" }, 500)
  }
}

export async function handleNew({ request, env, auth }: RouteCtx): Promise<Response> {
  const denied = requireEditor(auth!.role)
  if (denied) return denied

  const body = await readJson<{ title: string; filePath: string; content: string; turnstileToken: string; editSummary: string; articleType: string }>(request)
  if (body instanceof Response) return body
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : ""
  if (!title || typeof body.filePath !== "string" || typeof body.content !== "string" || !body.content.trim()) {
    return jsonResponse({ error: "Missing required fields" }, 400)
  }
  if (body.content.length > MAX_CONTENT_CHARS) return jsonResponse({ error: "Content too long" }, 413)

  // A markdown file under content/Wiki/ — no traversal, no empty segments.
  const filePath = body.filePath.trim()
  if (!/^content\/Wiki\/.+\.mdx?$/.test(filePath) || filePath.includes("..") || filePath.includes("//") || filePath.includes("\\")) {
    return jsonResponse({ error: "Invalid file path" }, 400)
  }
  const editSummary = typeof body.editSummary === "string" ? body.editSummary.trim().slice(0, 200) : ""
  const articleType = typeof body.articleType === "string" && body.articleType ? body.articleType.slice(0, 40) : "misc"

  if (!(await verifyTurnstile(env, body.turnstileToken, request))) {
    return jsonResponse({ error: "Captcha validation failed" }, 400)
  }

  try {
    const html_url = await openPullRequest(env, `new/${emailSlug(auth!.email)}-${branchSuffix()}`, [{
      path: filePath,
      base64: utf8Base64(body.content),
      message: `wiki: add ${title}`,
    }], {
      title: `Wiki new: ${title}`,
      body: `New wiki article: **${title}** (${articleType}) by ${auth!.email}.${editSummary ? `\n\n**Summary:** ${editSummary}` : ""}\n\nSubmitted via wiki editor.`,
    })

    const slug = filePath.replace(/^content\//, "").replace(/\.mdx?$/, "")
    await logEdit(env, slug, auth!.id, html_url, editSummary)
    notifyAdmin(env, `New Article: ${title}`,
      `A new article "${title}" was submitted by ${auth!.email}.\n\nReview it here: ${html_url}`,
      `<p>A new article <strong>${escapeHtml(title)}</strong> was submitted by ${escapeHtml(auth!.email)}.</p><p><a href="${html_url}">Review Pull Request</a></p>`)

    return jsonResponse({ prUrl: html_url })
  } catch (err) {
    console.error("New article error:", err)
    return jsonResponse({ error: "Failed to create article" }, 500)
  }
}

export async function handleBookmarks({ request, env, url, auth }: RouteCtx): Promise<Response> {
  const pathname = url.pathname

  // GET /api/bookmarks — list own bookmarks
  if (pathname === "/api/bookmarks" && request.method === "GET") {
    const res = await supabaseRest(env, `bookmarks?user_id=eq.${auth!.id}&select=slug,title,added_at&order=added_at.desc`)
    if (!res.ok) return upstreamError("bookmarks list", res, "Failed to fetch bookmarks")
    return jsonResponse(await res.json())
  }

  // POST /api/bookmarks — add bookmark
  if (pathname === "/api/bookmarks" && request.method === "POST") {
    const body = await readJson<{ slug: string; title: string }>(request)
    if (body instanceof Response) return body
    if (typeof body.slug !== "string" || !body.slug.trim() || typeof body.title !== "string" || !body.title.trim()) {
      return jsonResponse({ error: "slug and title required" }, 400)
    }
    const res = await supabaseRest(env, "bookmarks", "POST", {
      user_id: auth!.id, slug: body.slug.trim().slice(0, 300), title: body.title.trim().slice(0, 300),
    })
    if (!res.ok) {
      // 409 = already exists (UNIQUE constraint) — treat as success
      if (res.status === 409) return jsonResponse({ ok: true })
      return upstreamError("bookmark add", res, "Failed to add bookmark")
    }
    return jsonResponse({ ok: true })
  }

  // DELETE /api/bookmarks/:slug — remove bookmark
  if (pathname.startsWith("/api/bookmarks/") && request.method === "DELETE") {
    const slug = decodeURIComponent(pathname.slice("/api/bookmarks/".length))
    const res = await supabaseRest(env, `bookmarks?user_id=eq.${auth!.id}&slug=eq.${encodeURIComponent(slug)}`, "DELETE")
    if (!res.ok) return upstreamError("bookmark remove", res, "Failed to remove bookmark")
    return jsonResponse({ ok: true })
  }

  // POST /api/bookmarks/migrate — bulk-import from localStorage on first login
  if (pathname === "/api/bookmarks/migrate" && request.method === "POST") {
    const body = await readJson<{ bookmarks: { slug: string; title: string; addedAt: string }[] }>(request)
    if (body instanceof Response) return body
    if (!Array.isArray(body.bookmarks)) return jsonResponse({ error: "bookmarks array required" }, 400)
    const valid = body.bookmarks
      .filter((b) => typeof b?.slug === "string" && b.slug.trim() && typeof b.title === "string" && b.title.trim())
      .slice(0, 200)
    // One bulk upsert instead of up to 200 sequential round trips; duplicates are ignored.
    if (valid.length > 0) {
      const res = await supabaseRest(env, "bookmarks?on_conflict=user_id,slug", "POST",
        valid.map((b) => ({ user_id: auth!.id, slug: b.slug.trim().slice(0, 300), title: b.title.trim().slice(0, 300) })),
        "resolution=ignore-duplicates,return=minimal")
      if (!res.ok) return upstreamError("bookmark migrate", res, "Failed to import bookmarks")
    }
    return jsonResponse({ ok: true, migrated: valid.length })
  }

  return jsonResponse({ error: "Not found" }, 404)
}

export async function handleLockStatus({ env, url }: RouteCtx): Promise<Response> {
  const slug = url.searchParams.get("slug")
  if (!slug || !env.SUPABASE_URL) return jsonResponse({ locked: false })

  const pattern = slug.replace(/[\\%_]/g, (c) => `\\${c}`)
  const res = await supabaseRest(env, `page_locks?slug=ilike.${encodeURIComponent(pattern)}&select=slug,reason`)
  if (!res.ok) return jsonResponse({ locked: false })
  const locks = await res.json<{ slug: string; reason: string }[]>()
  if (locks.length === 0) return jsonResponse({ locked: false })
  return jsonResponse({ locked: true, reason: locks[0].reason })
}
