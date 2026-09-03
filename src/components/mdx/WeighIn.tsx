import type { ReactNode } from "react"
import styles from "./WeighIn.module.scss"

type Row = [label: string, left: ReactNode, right: ReactNode]

interface Props {
  /** Name of the competitor in the left corner. */
  left: string
  /** Name of the competitor in the right corner. */
  right: string
  /** Rows of the tale of the tape: [attribute, left value, right value]. */
  rows: Row[]
  /** Optional decision line printed under the table. */
  verdict?: ReactNode
}

/**
 * The Phil Chat Times "tale of the tape" — a boxing-style weigh-in table for the
 * room's bouts, mog-offs and debates. Two corners, a stack of measured rows, and
 * an optional verdict.
 *
 *   <WeighIn
 *     left="Quigley" right="Hugh"
 *     rows={[
 *       ["Truth", "Warranted assertibility", "Correspondence"],
 *       ["Messages", "804", "1,468"],
 *     ]}
 *     verdict="Hugh by decision, Quigley by his own account."
 *   />
 */
export function WeighIn({ left, right, rows, verdict }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.corners}>
        <span className={styles.corner}>{left}</span>
        <span className={styles.vs}>vs</span>
        <span className={`${styles.corner} ${styles.right}`}>{right}</span>
      </div>
      <table className={styles.table}>
        <tbody>
          {rows.map(([label, l, r], i) => (
            <tr key={i}>
              <td className={styles.val}>{l}</td>
              <th scope="row" className={styles.attr}>{label}</th>
              <td className={`${styles.val} ${styles.right}`}>{r}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {verdict && <div className={styles.verdict}>{verdict}</div>}
    </div>
  )
}
