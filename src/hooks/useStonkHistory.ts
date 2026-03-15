import { useState, useEffect } from "react"

interface StonkDay {
  date: string
  balance: number
}

export function useStonkHistory(username: string | null) {
  const [days, setDays] = useState<StonkDay[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!username) return
    setLoading(true)
    fetch(`/api/chat/users/${encodeURIComponent(username)}/stonk-history`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setDays(data.days ?? []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false))
  }, [username])

  return { days, loading }
}
