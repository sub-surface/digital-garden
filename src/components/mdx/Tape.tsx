import styles from "./Tape.module.scss"

interface Props {
  /** Optional label chip centred on the strip, e.g. "Vol I No 8". */
  label?: string
  /** Colour of the band. "accent" (default) is the paper's gold; "ink" is a dark rule. */
  tone?: "accent" | "ink"
}

/**
 * The Phil Chat Times measuring strip — the ruler-tick trim that runs under the
 * masthead of the paper, reused here as a section divider. Decorative; carries an
 * optional centred label.
 *
 *   <Tape />
 *   <Tape label="Sunday afternoon" />
 *   <Tape tone="ink" />
 */
export function Tape({ label, tone = "accent" }: Props) {
  return (
    <div className={styles.wrap} role="separator" aria-label={label ?? "divider"}>
      <span className={`${styles.strip} ${tone === "ink" ? styles.ink : ""}`} aria-hidden="true" />
      {label && <span className={styles.label}>{label}</span>}
      <span className={`${styles.strip} ${tone === "ink" ? styles.ink : ""}`} aria-hidden="true" />
    </div>
  )
}
