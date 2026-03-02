import { useNavigate } from "@tanstack/react-router"
import styles from "./NotFound.module.scss"

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div className={styles.container}>
      <div className={styles.glitchArt}>
        <pre>
{`
   _  _    ___   _  _ 
  | || |  / _ \ | || |
  | || |_| | | || || |_
  |__   _| | | ||__   _|
     | | | |_| |   | |
     |_|  \___/    |_|
`}
        </pre>
      </div>
      <h1 className={styles.title}>Territory Not Mapped</h1>
      <p className={styles.message}>
        The coordinates you requested do not correspond to any known sectors in the Sub-Surface index.
      </p>
      <div className={styles.actions}>
        <button 
          className={styles.button} 
          onClick={() => navigate({ to: "/" })}
        >
          {">"} RECOVER_TO_CORE
        </button>
      </div>
      <div className={styles.terminal}>
        <div className={styles.line}>[ERR] SECTOR_MISSING_OR_CORRUPT</div>
        <div className={styles.line}>[INF] ATTEMPTING_REROUTE... FAILED.</div>
        <div className={styles.line}>[WRN] UNKNOWN_PATH_DETECTED</div>
      </div>
    </div>
  )
}
