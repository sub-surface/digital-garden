import styles from "./SkipToContent.module.scss"

/**
 * Skip-to-content link. Visually hidden until focused, it must be the first
 * focusable element in a shell so keyboard users can jump straight past the
 * chrome (title, controls, breadcrumb) to the main content landmark.
 *
 * Each shell's <main> carries id="main-content" as the target.
 */
export function SkipToContent() {
  return (
    <a className={styles.skipLink} href="#main-content">
      Skip to content
    </a>
  )
}
