/// <reference types="@cloudflare/workers-types" />

interface Env {
  TURNSTILE_SECRET_KEY: string
  GITHUB_TOKEN: string
}

interface SubmitBody {
  turnstileToken: string
  // Basic info
  name: string
  username: string
  pronouns?: string
  imageUrl?: string
  imageBase64?: string   // raw base64, no data-URL prefix
  imageFilename?: string // original filename (used for extension)
  tradition?: string
  aos?: string
  influences?: string
  // Free-form page body (markdown)
  bodyContent?: string
  // Survey answers
  [key: string]: string | undefined
}

// Cloudflare Turnstile verification
async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  })
  const data = await res.json<{ success: boolean }>()
  return data.success
}

// Format submission as markdown matching Philsurvey Template structure
function formatMarkdown(body: SubmitBody): string {
  const fm = [
    "---",
    `title: "${body.name}'s Profile"`,
    `description: "Philchat wiki profile for ${body.name}"`,
    "tags: [wiki]",
    "type: chatter",
    `username: "${body.username}"`,
    body.pronouns ? `pronouns: "${body.pronouns}"` : null,
    body.imageUrl ? `image: "${body.imageUrl}"` : null,
    body.tradition ? `tradition: "${body.tradition}"` : null,
    body.aos ? `aos: "${body.aos}"` : null,
    body.influences ? `influences: "${body.influences}"` : null,
    "draft: true",
    "---",
  ].filter(Boolean).join("\n")

  const metaPhysicsQuestions = [
    ["apriori", "A priori knowledge"],
    ["abstractObjects", "Abstract objects"],
    ["analyticSynthetic", "Analytic-synthetic distinction"],
    ["epistemicJustification", "Epistemic justification"],
    ["externalWorld", "External world"],
    ["freeWill", "Free will"],
    ["knowledge", "Knowledge"],
    ["knowledgeClaims", "Knowledge claims"],
    ["mentalContent", "Mental content"],
    ["mind", "Mind"],
    ["perceptualExperience", "Perceptual experience"],
    ["personalIdentity", "Personal identity"],
    ["teletransporter", "Teletransporter (Survival or Death?)"],
    ["time", "Time"],
    ["truth", "Truth"],
    ["vagueness", "Vagueness"],
  ]

  const valueQuestions = [
    ["aestheticValue", "Aesthetic value"],
    ["eatingAnimals", "Eating animals"],
    ["experienceMachine", "Experience machine (Would you enter?)"],
    ["footbridge", "Footbridge (Push or Don't Push?)"],
    ["gender", "Gender"],
    ["meaningOfLife", "Meaning of life"],
    ["metaEthics", "Meta-ethics"],
    ["moralJudgment", "Moral judgment"],
    ["moralMotivation", "Moral motivation"],
    ["moralPrinciples", "Moral principles"],
    ["normativeEthics", "Normative ethics"],
    ["politicalPhilosophy", "Political philosophy"],
    ["race", "Race"],
    ["trolleyProblem", "Trolley problem (Switch or Don't Switch?)"],
  ]

  const logicQuestions = [
    ["lawsOfNature", "Laws of nature"],
    ["logic", "Logic"],
    ["newcomb", "Newcomb's problem"],
    ["properNames", "Proper names"],
    ["science", "Science"],
  ]

  const metaphilosophyQuestions = [
    ["aimOfPhilosophy", "Aim of philosophy"],
    ["god", "God"],
    ["philosophicalMethods", "Philosophical methods"],
    ["philosophicalProgress", "Philosophical progress"],
  ]

  function renderSection(title: string, questions: string[][]): string {
    const lines = questions
      .map(([key, label]) => {
        const val = body[key]
        return val ? `* **${label}:** ${val}` : `* **${label}:** [no answer]`
      })
      .join("\n")
    return `## ${title}\n${lines}`
  }

  const sections = [
    renderSection("Metaphysics & Epistemology", metaPhysicsQuestions),
    renderSection("Value Theory (Ethics, Politics, & Aesthetics)", valueQuestions),
    renderSection("Logic, Language, & Science", logicQuestions),
    renderSection("Metaphilosophy & Religion", metaphilosophyQuestions),
  ].join("\n\n")

  const notes = body.additionalNotes
    ? `\n\n---\n## Additional Notes / Nuance\n${body.additionalNotes}`
    : ""

  const bodySection = body.bodyContent?.trim()
    ? `\n\n---\n\n${body.bodyContent.trim()}`
    : ""

  return `${fm}\n\n# ${body.name}'s Profile\n\n${sections}${notes}${bodySection}\n`
}

// GitHub API helpers
async function githubRequest(
  path: string,
  method: string,
  token: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "digital-garden-wiki-submit/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  // Explicit fail-safe for missing env vars
  if (!env.TURNSTILE_SECRET_KEY) {
    return Response.json({ error: "Server misconfiguration" }, { status: 500 })
  }
  if (!env.GITHUB_TOKEN) {
    return Response.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  let body: SubmitBody
  try {
    body = await request.json<SubmitBody>()
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  // Validate required fields
  if (!body.name?.trim() || !body.username?.trim() || !body.turnstileToken) {
    return Response.json({ error: "Missing required fields: name, username, turnstileToken" }, { status: 400 })
  }

  // Verify Turnstile
  const captchaOk = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY)
  if (!captchaOk) {
    return Response.json({ error: "Captcha validation failed" }, { status: 400 })
  }

  try {
    // 1. Get latest SHA of main
    const refRes = await githubRequest(
      "/repos/sub-surface/digital-garden/git/ref/heads/main",
      "GET",
      env.GITHUB_TOKEN,
    )
    if (!refRes.ok) throw new Error(`Failed to get main ref: ${refRes.status}`)
    const refData = await refRes.json<{ object: { sha: string } }>()
    const mainSha = refData.object.sha

    // 2. Create branch with random suffix to avoid collisions
    const timestamp = Date.now()
    const randomSuffix = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0")
    const safeName = body.username.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()
    const branchName = `submit/${safeName}-${timestamp}-${randomSuffix}`

    const branchRes = await githubRequest(
      "/repos/sub-surface/digital-garden/git/refs",
      "POST",
      env.GITHUB_TOKEN,
      { ref: `refs/heads/${branchName}`, sha: mainSha },
    )
    if (!branchRes.ok) throw new Error(`Failed to create branch: ${branchRes.status}`)

    // 3a. Commit profile image if uploaded
    let resolvedImageUrl = body.imageUrl || ""
    if (body.imageBase64 && body.imageFilename) {
      const ext = body.imageFilename.split(".").pop()?.toLowerCase() ?? "jpg"
      const safeExt = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? ext : "jpg"
      const imgPath = `content/Wiki/chatters/images/${safeName}.${safeExt}`

      const imgRes = await githubRequest(
        `/repos/sub-surface/digital-garden/contents/${imgPath}`,
        "PUT",
        env.GITHUB_TOKEN,
        {
          message: `wiki: add profile image for ${body.username}`,
          content: body.imageBase64,
          branch: branchName,
        },
      )
      if (!imgRes.ok) throw new Error(`Failed to commit image: ${imgRes.status}`)

      // Use the raw.githubusercontent.com URL — resolves once the PR is merged to main
      resolvedImageUrl = `https://raw.githubusercontent.com/sub-surface/digital-garden/main/${imgPath}`
    }

    // 3b. Commit the markdown file (with resolved image URL)
    const markdown = formatMarkdown({ ...body, imageUrl: resolvedImageUrl })
    const filePath = `content/Wiki/chatters/${safeName}.md`
    const contentBase64 = btoa(unescape(encodeURIComponent(markdown)))

    const commitRes = await githubRequest(
      `/repos/sub-surface/digital-garden/contents/${filePath}`,
      "PUT",
      env.GITHUB_TOKEN,
      {
        message: `wiki: add profile submission for ${body.username}`,
        content: contentBase64,
        branch: branchName,
      },
    )
    if (!commitRes.ok) throw new Error(`Failed to commit file: ${commitRes.status}`)

    // 4. Open PR
    const prRes = await githubRequest(
      "/repos/sub-surface/digital-garden/pulls",
      "POST",
      env.GITHUB_TOKEN,
      {
        title: `Wiki profile: ${body.username}`,
        head: branchName,
        base: "main",
        body: `New wiki profile submission for **${body.name}** (${body.username}).\n\nSubmitted via wiki.subsurfaces.net/wiki/submit`,
      },
    )
    if (!prRes.ok) throw new Error(`Failed to create PR: ${prRes.status}`)
    const prData = await prRes.json<{ html_url: string }>()

    return Response.json({ prUrl: prData.html_url }, { status: 200 })
  } catch (err) {
    console.error("Submit function error:", err)
    return Response.json({ error: "Failed to create submission" }, { status: 500 })
  }
}
