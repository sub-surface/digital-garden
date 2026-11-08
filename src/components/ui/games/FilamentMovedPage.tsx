import styles from "./FilamentMovedPage.module.scss"

const FILAMENT_ORIGIN = "https://filament.subsurfaces.net"

/**
 * FILAMENT was extracted into its own project on 2026-11-08. This keeps the old
 * `/filament` slug alive so existing links land somewhere useful. The deep-link
 * query (`?seed=&z=&halo=&level=`) is forwarded: the new app reads the same one.
 */
export function FilamentMovedPage() {
  const query = typeof window !== "undefined" ? window.location.search : ""
  const href = `${FILAMENT_ORIGIN}/${query}`
  return (
    <section className={styles.moved}>
      <h1>FILAMENT has moved</h1>
      <p>
        The cosmic web, down through a galaxy to a black hole, now has a page of its own.
      </p>
      <p>
        <a href={href}>filament.subsurfaces.net</a>
      </p>
    </section>
  )
}
