import { Env, ProfileData, RouteCtx } from "./types"
import { ghApi, jsonResponse, supabaseRest, upstreamError } from "./lib"
import { getContentIndex, chatterImageForUsername } from "./meta"

/** Encode a user-supplied scalar as a safe YAML value. JSON strings are valid
 * YAML, so this neutralises quote/newline/key injection into frontmatter —
 * a crafted submission must not be able to add frontmatter keys or break the
 * prebuild parser after the PR merges. */
function yamlStr(value: string): string {
  return JSON.stringify(value.replace(/[\r\n]+/g, " ").trim())
}

export async function handleSubmit({ request, env }: RouteCtx): Promise<Response> {
  if (!env.TURNSTILE_SECRET_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Server misconfiguration" }, 500)
  }

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400)
  }

  if (!body.name?.trim() || !body.username?.trim() || !body.turnstileToken) {
    return jsonResponse({ error: "Missing required fields" }, 400)
  }

  const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: body.turnstileToken }),
  })
  const tsData = await tsRes.json<{ success: boolean }>()
  if (!tsData.success) {
    return jsonResponse({ error: "Captcha validation failed" }, 400)
  }

  const gh = ghApi(env)

  try {
    const refRes = await gh("/repos/sub-surface/digital-garden/git/ref/heads/master", "GET")
    if (!refRes.ok) {
      const txt = await refRes.text()
      throw new Error(`get ref: ${refRes.status} — ${txt}`)
    }
    const { object: { sha: mainSha } } = await refRes.json<{ object: { sha: string } }>()

    const name = String(body.name).trim()
    const username = String(body.username).trim()
    const safeName = username.replace(/^[^a-zA-Z0-9]+/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
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
        message: `wiki: add profile image for ${safeName}`,
        content: body.imageBase64,
        branch: branchName,
      })
      if (!imgRes.ok) throw new Error(`commit image: ${imgRes.status}`)
      resolvedImageUrl = `/content/Media/Wiki/chatters/${safeName}.${ext}`
    }

    const fm = [
      "---",
      `title: ${yamlStr(`${name}'s Profile`)}`,
      `description: ${yamlStr(`Philchat wiki profile for ${name}`)}`,
      "tags: [wiki, chatter]", "type: chatter",
      `username: ${yamlStr(username)}`,
      body.pronouns ? `pronouns: ${yamlStr(String(body.pronouns))}` : null,
      resolvedImageUrl ? `image: ${yamlStr(String(resolvedImageUrl))}` : null,
      body.tradition ? `tradition: ${yamlStr(String(body.tradition))}` : null,
      body.aos ? `aos: ${yamlStr(String(body.aos))}` : null,
      body.influences ? `influences: ${yamlStr(String(body.influences))}` : null,
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
    const markdown = `${fm}\n\n# ${name}'s Profile\n\n${bodySection}${sections}${notes}\n`

    const filePath = `content/Wiki/chatters/${safeName}.md`
    const commitRes = await gh(`/repos/sub-surface/digital-garden/contents/${filePath}`, "PUT", {
      message: `wiki: add profile submission for ${safeName}`,
      content: btoa(unescape(encodeURIComponent(markdown))),
      branch: branchName,
    })
    if (!commitRes.ok) throw new Error(`commit file: ${commitRes.status}`)

    const prRes = await gh("/repos/sub-surface/digital-garden/pulls", "POST", {
      title: `Wiki profile: ${safeName}`,
      head: branchName, base: "master",
      body: `New wiki profile submission for **${name.replace(/[*_`[\]]/g, "")}** (${safeName}).\n\nSubmitted via wiki.subsurfaces.net/wiki/submit`,
    })
    if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
    const { html_url } = await prRes.json<{ html_url: string }>()

    if (env.EMAIL) {
      env.EMAIL.send({
        from: { email: "system@subsurfaces.net", name: "Subsurface Wiki" },
        to: "admin@subsurfaces.net",
        subject: `New Profile Submission: ${safeName}`,
        text: `A new profile has been submitted by ${name} (${safeName}).\n\nReview it here: ${html_url}`,
        html: `<p>A new profile has been submitted (@${safeName}).</p><p><a href="${html_url}">Review Pull Request</a></p>`
      }).catch(err => console.error("Email send error:", err))
    }

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

export async function handleEdit({ request, env, auth }: RouteCtx): Promise<Response> {
  if (auth!.role !== "editor" && auth!.role !== "admin") {
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
      return await createEditPR(gh, env, auth!, altData.path, altData.sha, body.content, slug, body.editSummary)
    }
    const fileData = await fileRes.json<{ sha: string; path: string }>()
    return await createEditPR(gh, env, auth!, fileData.path, fileData.sha, body.content, slug, body.editSummary)
  } catch (err) {
    console.error("Edit error:", err)
    return jsonResponse({ error: "Failed to create edit" }, 500)
  }
}

export async function createEditPR(
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

  if (env.EMAIL) {
    env.EMAIL.send({
      from: { email: "system@subsurfaces.net", name: "Subsurface Wiki" },
      to: "admin@subsurfaces.net",
      subject: `New Wiki Edit: ${slug}`,
      text: `An edit to ${slug} was submitted by ${auth.email}.\n\nReview it here: ${html_url}`,
      html: `<p>An edit to <strong>${slug}</strong> was submitted by ${auth.email}.</p><p><a href="${html_url}">Review Pull Request</a></p>`
    }).catch(err => console.error("Email send error:", err))
  }

  return jsonResponse({ prUrl: html_url })
}

export async function handleNew({ request, env, auth }: RouteCtx): Promise<Response> {
  if (auth!.role !== "editor" && auth!.role !== "admin") {
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

    const safeName = auth!.email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
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
      body: `New wiki article: **${body.title}** (${body.articleType || "misc"}) by ${auth!.email}.${body.editSummary ? `\n\n**Summary:** ${body.editSummary}` : ""}\n\nSubmitted via wiki editor.`,
    })
    if (!prRes.ok) throw new Error(`create PR: ${prRes.status}`)
    const { html_url } = await prRes.json<{ html_url: string }>()

    // Log the creation
    const slug = filePath.replace(/^content\//, "").replace(/\.md$/, "")
    await supabaseRest(env, "edit_log", "POST", {
      slug, user_id: auth!.id, pr_url: html_url, edit_summary: body.editSummary || null,
    })

    if (env.EMAIL) {
      env.EMAIL.send({
        from: { email: "system@subsurfaces.net", name: "Subsurface Wiki" },
        to: "admin@subsurfaces.net",
        subject: `New Article: ${body.title}`,
        text: `A new article "${body.title}" was submitted by ${auth!.email}.\n\nReview it here: ${html_url}`,
        html: `<p>A new article <strong>${body.title}</strong> was submitted by ${auth!.email}.</p><p><a href="${html_url}">Review Pull Request</a></p>`
      }).catch(err => console.error("Email send error:", err))
    }

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
    let body: { slug?: string; title?: string }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid body" }, 400) }
    if (!body.slug?.trim() || !body.title?.trim()) return jsonResponse({ error: "slug and title required" }, 400)
    const res = await supabaseRest(env, "bookmarks", "POST", {
      user_id: auth!.id, slug: body.slug.trim(), title: body.title.trim(),
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
    let body: { bookmarks?: { slug: string; title: string; addedAt: string }[] }
    try { body = await request.json() } catch { return jsonResponse({ error: "Invalid body" }, 400) }
    if (!Array.isArray(body.bookmarks)) return jsonResponse({ error: "bookmarks array required" }, 400)
    const valid = body.bookmarks.filter((b) => b.slug?.trim() && b.title?.trim()).slice(0, 200)
    // Upsert all — ignore conflicts
    for (const b of valid) {
      await supabaseRest(env, "bookmarks", "POST", {
        user_id: auth!.id, slug: b.slug.trim(), title: b.title.trim(),
      })
    }
    return jsonResponse({ ok: true, migrated: valid.length })
  }

  return jsonResponse({ error: "Not found" }, 404)
}

export async function handleLockStatus({ env, url }: RouteCtx): Promise<Response> {
  const slug = url.searchParams.get("slug")
  if (!slug || !env.SUPABASE_URL) return jsonResponse({ locked: false })

  const res = await supabaseRest(env, `page_locks?slug=eq.${encodeURIComponent(slug)}&select=slug,reason`)
  if (!res.ok) return jsonResponse({ locked: false })
  const locks = await res.json<{ slug: string; reason: string }[]>()
  if (locks.length === 0) return jsonResponse({ locked: false })
  return jsonResponse({ locked: true, reason: locks[0].reason })
}
