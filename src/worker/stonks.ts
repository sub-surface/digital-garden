import { Env } from "./types"
import { supabaseRest, jsonResponse } from "./lib"

export async function getStonkConfig(env: Env): Promise<Record<string, number>> {
  const res = await supabaseRest(env, "stonk_config?select=key,value")
  if (!res.ok) return {}
  const rows = await res.json<{ key: string; value: number }[]>()
  const config: Record<string, number> = {}
  for (const r of rows) config[r.key] = r.value
  return config
}

export async function writeStonkLedger(
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

export async function processStonkReaction(
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

export async function handleStonkHistory(request: Request, env: Env, username: string): Promise<Response> {
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
