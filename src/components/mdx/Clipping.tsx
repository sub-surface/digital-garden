import type { ReactNode } from "react"
import styles from "./Clipping.module.scss"

interface Props {
  /** Who said it, e.g. "Stackhouse". */
  cite?: ReactNode
  /** Issue or dateline, e.g. "Vol I No 8". Printed as a small kicker. */
  issue?: string
  children: ReactNode
}

/**
 * A clipping from The Phil Chat Times: a line from the room set apart in the
 * paper's broadsheet voice, with an optional attribution and issue kicker.
 *
 *   <Clipping cite="Stackhouse" issue="Vol I No 8">
 *     The fun police have shown up.
 *   </Clipping>
 */
export function Clipping({ cite, issue, children }: Props) {
  return (
    <figure className={styles.clip}>
      <div className={styles.kicker}>
        <span className={styles.mast}>The Phil Chat Times</span>
        {issue && <span className={styles.issue}>{issue}</span>}
      </div>
      <blockquote className={styles.quote}>{children}</blockquote>
      {cite && <figcaption className={styles.cite}>&mdash; {cite}</figcaption>}
    </figure>
  )
}
