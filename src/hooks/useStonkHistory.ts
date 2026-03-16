import { useState, useEffect } from "react"

interface StonkDay {
  date: string
  balance: number
}

export function useStonkHistory(username: string | null) {
  const [days, setDays] = useState<StonkDay[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!username) return
    setLoading(true)

    const historyFetch = fetch(`/api/chat/users/${encodeURIComponent(username)}/stonk-history`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setDays(data.days ?? []))
      .catch(() => setDays([]))

    const balanceFetch = fetch(`/api/chat/users/${encodeURIComponent(username)}/mini`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setBalance(data.stonk_balance ?? null))
      .catch(() => setBalance(null))

    Promise.all([historyFetch, balanceFetch]).finally(() => setLoading(false))
  }, [username])

  return { days, balance, loading }
}
