import { useEffect, useRef } from "react"
import { useStore } from "@/store"
import styles from "./PersianCarpetPage.module.scss"

export function PersianCarpetPage() {
  const theme = useStore((s) => s.theme)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // On theme change, tell the iframe so it can re-skin without a reload.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "theme", value: theme }, "*")
  }, [theme])

  return (
    <div className={styles.carpet}>
      <iframe
        ref={iframeRef}
        src={`/games/persian-carpet.html?theme=${theme}`}
        title="The Knotted Field — Persian Carpet Loom"
        className={styles.frame}
        sandbox="allow-scripts allow-downloads allow-same-origin"
        allow="accelerometer"
      />
    </div>
  )
}
