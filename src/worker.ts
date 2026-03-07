interface Env {
  ASSETS: Fetcher
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
}

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

    const safeName = body.username.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
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
      const imgPath = `content/Wiki/chatters/images/${safeName}.${ext}`
      const imgRes = await gh(`/repos/sub-surface/digital-garden/contents/${imgPath}`, "PUT", {
        message: `wiki: add profile image for ${body.username}`,
        content: body.imageBase64,
        branch: branchName,
      })
      if (!imgRes.ok) throw new Error(`commit image: ${imgRes.status}`)
      resolvedImageUrl = `https://raw.githubusercontent.com/sub-surface/digital-garden/master/${imgPath}`
    }

    const fm = [
      "---",
      `title: "${body.name}'s Profile"`,
      `description: "Philchat wiki profile for ${body.name}"`,
      "tags: [wiki]", "type: chatter",
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
    const bodySection = body.bodyContent?.trim() ? `\n\n---\n\n${body.bodyContent.trim()}` : ""
    const markdown = `${fm}\n\n# ${body.name}'s Profile\n\n${sections}${notes}${bodySection}\n`

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
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
