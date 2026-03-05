import { useState, useEffect } from "react"
import { useStore } from "@/store"
import { MusicBar } from "@/components/ui/MusicBar"
import { SearchButton } from "@/components/ui/SearchButton"
import { BgModeToggle } from "@/components/ui/BgModeToggle"
import styles from "./QuickControls.module.scss"

function formatDateTime(): string {
  const d = new Date()
  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" })
  const monthName = d.toLocaleDateString("en-GB", { month: "long" })
  const day = d.getDate()
  const year = d.getFullYear()
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  
  // Custom ordinal suffix
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  return `${dayName}, ${monthName} ${getOrdinal(day)} ${year} | ${time}`
}

export function QuickControls() {
  const [time, setTime] = useState(() => formatDateTime())
  const theme = useStore((s) => s.theme)
  const accentBase = useStore((s) => s.accentBase)
  const cycleAccent = useStore((s) => s.cycleAccent)
  const setTheme = (t: "light" | "dark") => useStore.getState().setTheme(t)

  useEffect(() => {
    const id = setInterval(() => setTime(formatDateTime()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={styles.quickControls} data-panel-ignore>
      {/* 1. Music Player */}
      <MusicBar />

      {/* 2. Search */}
      <SearchButton />

      {/* 3. Day/Night Toggle */}
      <button 
        className={styles.iconBtn} 
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? "\u263C" : "\u263E"}
      </button>

      {/* 4. Theme Cycle Dot (ROYGBIV) */}
      <button 
        className={styles.themeDot} 
        onClick={cycleAccent}
        style={{ backgroundColor: accentBase }}
        title="Cycle accent color"
      />

      {/* 5. Background Mode */}
      <BgModeToggle />

      {/* 6. Clock */}
      <div className={styles.clockGroup}>
        <span className={styles.clock}>{time}</span>
      </div>
    </div>
  )
}
