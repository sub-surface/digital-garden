import { useState } from "react"
import styles from "./CookieConsent.module.scss"

export function CookieConsent() {
  const [visible, setVisible] = useState(() => {
    if (typeof localStorage === "undefined") return false
    return !localStorage.getItem("cookie-consent")
  })

  if (!visible) return null

  function handleAccept() {
    localStorage.setItem("cookie-consent", "accepted")
    setVisible(false)
  }

  function handleReject() {
    localStorage.setItem("cookie-consent", "rejected")
    setVisible(false)
    // Reload so Supabase reinitialises without cookie storage
    window.location.reload()
  }

  return (
    <div className={styles.banner}>
      <span className={styles.text}>
        This site uses cookies for authentication across subdomains.{" "}
        <a href="/privacy" className={styles.link}>Privacy policy</a>
      </span>
      <div className={styles.actions}>
        <button className={styles.accept} onClick={handleAccept}>Accept</button>
        <button className={styles.reject} onClick={handleReject}>Reject</button>
      </div>
    </div>
  )
}
