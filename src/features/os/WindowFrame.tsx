import { useCallback, useMemo, useState } from "react"
import { useOS, type OSWindow } from "./osStore"
import { useDrag, type DragBounds, type ResizeEdge } from "./useDrag"
import { OSIcon, type IconName } from "./OSIcon"
import styles from "./OS.module.scss"
import type { OSMenu } from "./osMenus"

const EDGES: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]
const GRIP_CLASS: Record<ResizeEdge, string> = {
  n: styles.gripN,
  s: styles.gripS,
  e: styles.gripE,
  w: styles.gripW,
  ne: styles.gripNE,
  nw: styles.gripNW,
  se: styles.gripSE,
  sw: styles.gripSW,
}

interface Props {
  win: OSWindow
  icon: IconName
  focused: boolean
  bounds: DragBounds
  menus?: OSMenu[]
  status?: string[]
  children: React.ReactNode
}

export function WindowFrame({ win, icon, focused, bounds, menus, status, children }: Props) {
  // Per-action selectors: actions are stable, so a window no longer
  // re-renders on every store change (each focus click used to re-render
  // every open window and its live document).
  const focusWindow = useOS((s) => s.focusWindow)
  const closeWindow = useOS((s) => s.closeWindow)
  const toggleMinimize = useOS((s) => s.toggleMinimize)
  const toggleMaximize = useOS((s) => s.toggleMaximize)
  const toggleShade = useOS((s) => s.toggleShade)
  const moveWindow = useOS((s) => s.moveWindow)
  const resizeWindow = useOS((s) => s.resizeWindow)

  const maximized = win.state === "maximized"
  const shaded = win.state === "shaded"
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const geometry = useMemo(
    () => ({ x: win.x, y: win.y, w: win.w, h: win.h }),
    [win.x, win.y, win.w, win.h],
  )

  const onCommit = useCallback(
    (geo: { x: number; y: number; w: number; h: number }) => {
      if (geo.w !== win.w || geo.h !== win.h) resizeWindow(win.id, geo)
      else moveWindow(win.id, geo.x, geo.y)
    },
    [win.id, win.w, win.h, moveWindow, resizeWindow],
  )

  const { ghost, handlers, beginMove, beginResize } = useDrag({
    geometry,
    bounds,
    onCommit,
    disabled: maximized,
  })

  // Minimized and shaded windows stay MOUNTED and are only hidden. Unmounting
  // them threw away program state: Paint lost an unsaved picture, Solitaire
  // dealt a new game (and bumped its stats) on restore.
  const minimized = win.state === "minimized"
  const hiddenStyle = minimized ? { display: "none" } : undefined

  return (
    <>
      {ghost && (
        <div
          className={styles.dragGhost}
          style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }}
        />
      )}

      <div
        className={`${styles.window} ${maximized ? styles.windowMax : ""}`}
        style={maximized ? { zIndex: win.z, ...hiddenStyle } : { left: win.x, top: win.y, width: win.w, height: shaded ? undefined : win.h, zIndex: win.z, ...hiddenStyle }}
        aria-hidden={minimized || undefined}
        data-focused={focused}
        data-shaded={shaded || undefined}
        // Capture phase: focus must win even when the click lands on a control
        // inside the document, otherwise clicking a link in an unfocused window
        // leaves it behind its neighbours.
        onPointerDownCapture={(e) => {
          focusWindow(win.id)
          if (!(e.target as HTMLElement).closest("[data-os-menu]")) setOpenMenu(null)
        }}
        role="dialog"
        aria-label={win.title}
      >
        <div
          className={styles.titleBar}
          onPointerDown={beginMove}
          onDoubleClick={() => toggleShade(win.id)}
          {...handlers}
        >
          <OSIcon name={icon} size={16} />
          <span className={styles.titleText}>{win.title}</span>
          <div className={styles.titleButtons}>
            <button
              className={styles.titleBtn}
              onClick={() => toggleMinimize(win.id)}
              // The title bar owns pointerdown for dragging; without this a
              // press on a button would start a drag instead of pressing it.
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label={`Minimize ${win.title}`}
            >
              _
            </button>
            <button
              className={styles.titleBtn}
              onClick={() => toggleMaximize(win.id)}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label={`${maximized ? "Restore" : "Maximize"} ${win.title}`}
            >
              {maximized ? "❐" : "▢"}
            </button>
            <button
              className={styles.titleBtn}
              onClick={() => closeWindow(win.id)}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              aria-label={`Close ${win.title}`}
            >
              ✕
            </button>
          </div>
        </div>

        {!shaded && menus && menus.length > 0 && (
          <div className={styles.menuBar} data-os-menu>
            {menus.map((menu) => (
              <div key={menu.label} className={styles.menuRoot}>
                <button
                  className={styles.menuItem}
                  type="button"
                  aria-expanded={openMenu === menu.label}
                  onClick={() => setOpenMenu((current) => current === menu.label ? null : menu.label)}
                >
                  {menu.label}
                </button>
                {openMenu === menu.label && (
                  <div className={styles.menuPopup} role="menu">
                    {menu.items.map((item) => (
                      <div key={item.label}>
                        <button
                          type="button"
                          className={styles.menuEntry}
                          role="menuitem"
                          disabled={item.disabled}
                          onClick={() => {
                            item.onSelect?.()
                            setOpenMenu(null)
                          }}
                        >
                          {item.label}
                        </button>
                        {item.separatorAfter && <div className={styles.menuSeparator} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={styles.docArea} style={shaded ? { display: "none" } : undefined}>{children}</div>

        {!shaded && status && status.length > 0 && (
          <div className={styles.statusBar}>
            {status.map((s, i) => (
              <span key={i} className={styles.statusCell}>
                {s}
              </span>
            ))}
          </div>
        )}

        {!maximized && !shaded &&
          EDGES.map((edge) => (
            <div
              key={edge}
              className={`${styles.grip} ${GRIP_CLASS[edge]}`}
              onPointerDown={beginResize(edge)}
              {...handlers}
            />
          ))}
      </div>
    </>
  )
}
