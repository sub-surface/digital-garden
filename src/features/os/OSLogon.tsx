import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { OSIcon } from "./OSIcon"
import styles from "./OS.module.scss"
import explorer from "./Explorer.module.scss"

interface Props {
  onContinue: (options: { guest: boolean; rememberGuest: boolean; setupWiki: boolean }) => void
}

export function OSLogon({ onContinue }: Props) {
  const auth = useAuth()
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [rememberGuest, setRememberGuest] = useState(true)
  const [setupWiki, setSetupWiki] = useState(false)
  const usernameValid = /^[a-zA-Z0-9-]{3,30}$/.test(username)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    const result = mode === "signup"
      ? await auth.signUp(email.trim(), username.trim(), password, "https://wiki.subsurfaces.net")
      : mode === "recover"
        ? await auth.resetPassword(email.trim(), "https://wiki.subsurfaces.net")
        : await auth.signInWithPassword(email.trim(), password)
    setSubmitting(false)
    if (result.error) setMessage(result.error)
    else if (mode === "login") setMessage("Credentials accepted. Preparing your desktop…")
    else setMessage(mode === "signup" ? "Account created. Confirm the email, then log on here." : "Password reset instructions sent.")
  }

  return (
    <div className={styles.logon} role="dialog" aria-label="Log on to Subsurfaces 95">
      <div className={styles.logonMark}>
        <OSIcon name="computer" size={52} />
        <div><strong>Subsurfaces 95</strong><span>Make yourself at home.</span></div>
      </div>
      {auth.loading ? <p>Contacting the domain controller…</p> : auth.session ? (
        <div className={styles.logonForm}>
          <p>Welcome back, <strong>{auth.username ?? auth.session.user.email ?? "reader"}</strong>.</p>
          <span className={styles.logonDim}>Your wiki, recovered files, Messenger and owner permissions are connected.</span>
          {!auth.claimed_slug && (
            <label className={explorer.radioRow}><input type="checkbox" checked={setupWiki} onChange={(event) => setSetupWiki(event.target.checked)} />Set up a wiki page after logon</label>
          )}
          <button className={explorer.button} type="button" onClick={() => onContinue({ guest: false, rememberGuest: false, setupWiki })}>Enter desktop</button>
          <button className={explorer.button} type="button" onClick={() => void auth.signOut()}>Use another account</button>
        </div>
      ) : (
        <form className={styles.logonForm} onSubmit={submit}>
          <div className={styles.logonTabs}>
            <button type="button" data-active={mode === "login"} onClick={() => { setMode("login"); setMessage(null) }}>Log on</button>
            <button type="button" data-active={mode === "signup"} onClick={() => { setMode("signup"); setMessage(null) }}>Create account</button>
            <button type="button" data-active={mode === "recover"} onClick={() => { setMode("recover"); setMessage(null) }}>Recovery</button>
          </div>
          {mode === "signup" && <label>User name<input className={explorer.select} value={username} onChange={(event) => setUsername(event.target.value)} required /></label>}
          <label>Email<input className={explorer.select} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {mode !== "recover" && <label>Password<input className={explorer.select} type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
          {mode === "signup" && username && !usernameValid && <span className={styles.logonDim}>Use 3–30 letters, numbers or hyphens.</span>}
          {message && <span className={styles.logonDim} role="status">{message}</span>}
          <button className={explorer.button} disabled={submitting || (mode === "signup" && !usernameValid)}>
            {submitting ? "Please wait…" : mode === "signup" ? "Create account" : mode === "recover" ? "Send reset link" : "Log on"}
          </button>
          <div className={styles.logonGuest}>
            <button className={explorer.button} type="button" onClick={() => onContinue({ guest: true, rememberGuest, setupWiki: false })}>Continue as guest</button>
            <label><input type="checkbox" checked={rememberGuest} onChange={(event) => setRememberGuest(event.target.checked)} />Remember this choice on this browser</label>
          </div>
        </form>
      )}
      <span className={styles.logonFoot}>One account across the garden, wiki, chat and this machine.</span>
    </div>
  )
}
