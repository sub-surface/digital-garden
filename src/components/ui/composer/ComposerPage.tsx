import { useCallback, useEffect, useRef, useState } from "react"
import type { Box, PenRole, Plate, PostParams, Connector } from "@/lib/composer/types"
import { generate } from "@/lib/composer/generate"
import { renderSVG } from "@/lib/composer/render/svg"
import { realizeNode } from "@/lib/composer/realize"
import { accentPalette, getPalette, PALETTES } from "@/lib/composer/pens"
import { getEra, ERAS } from "@/lib/composer/eras"
import { ARMATURES } from "@/lib/composer/armatures"
import { toPNGBlob } from "@/lib/composer/render/raster"
import { encodePlate, decodePlate } from "@/lib/composer/serialize"
import { ComposerStage } from "./ComposerStage"
import { ComposerRail } from "./ComposerRail"
import { Inspector } from "./Inspector"
import { ContactSheet } from "./ContactSheet"
import type { Sel } from "./selection"
import { sameSel, existsInPlate } from "./selection"
import styles from "./ComposerPage.module.scss"

/**
 * Apparatus — a seeded, curatable engine for generative dithered plates. The
 * full-bleed studio shell. The IR is editable state with an undo stack: select /
 * lock / re-roll / drag / delete on the stage + inspector, then regenerate the
 * unlocked rest. Era/palette/post are render-time — switching them is an instant
 * re-emulation that never touches geometry.
 */
const DEFAULT_POST: PostParams = { inkBias: 0, contrast: 1, handJitter: 0.3, lineWeight: 1 }
const nodeOf = (ref: string) => ref.slice(0, ref.indexOf("#"))
const randSeed = () => (Math.random() * 0x7fffffff) | 0

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Update one node and re-resolve its anchors so attached connectors follow. */
function withNode(p: Plate, id: string, fn: (n: Plate["nodes"][number]) => Plate["nodes"][number]): Plate {
  return {
    ...p,
    nodes: p.nodes.map((n) => {
      if (n.id !== id) return n
      const u = fn(n)
      return { ...u, anchors: realizeNode(u, p.seed).anchors }
    }),
  }
}

export function ComposerPage() {
  const [plate, setPlate] = useState<Plate>(() =>
    generate({ seed: `plate-${1000 + Math.floor(Math.random() * 9000)}`, era: "mac-1bit", paletteId: "manuscript" }),
  )
  const [selection, setSelection] = useState<Sel[]>([])
  const [archetypeSel, setArchetypeSel] = useState("auto")
  const [vibes, setVibes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const plateRef = useRef(plate)
  plateRef.current = plate
  const undoRef = useRef<Plate[]>([])
  const redoRef = useRef<Plate[]>([])

  const seedNum = parseInt((plate.seed.match(/\d+/) ?? ["0"])[0], 10)

  // ─── History ───────────────────────────────────────────────────────────────
  // Ref bookkeeping stays OUTSIDE the setState updater: StrictMode double-invokes
  // updaters in dev, which would corrupt the undo stack. plateRef is kept in sync
  // during render (above), so it is the reliable "current plate" here.
  const pushHistory = (prev: Plate) => {
    undoRef.current.push(prev)
    if (undoRef.current.length > 60) undoRef.current.shift()
    redoRef.current = []
  }

  const commit = useCallback((updater: (p: Plate) => Plate) => {
    const prev = plateRef.current
    const next = updater(prev)
    if (next === prev) return
    pushHistory(prev)
    plateRef.current = next
    setPlate(next)
  }, [])

  const undo = useCallback(() => {
    const p = undoRef.current.pop()
    if (!p) return
    redoRef.current.push(plateRef.current)
    plateRef.current = p
    setPlate(p)
  }, [])

  const redo = useCallback(() => {
    const n = redoRef.current.pop()
    if (!n) return
    undoRef.current.push(plateRef.current)
    plateRef.current = n
    setPlate(n)
  }, [])

  // Prune selections pointing at elements a regeneration removed.
  useEffect(() => {
    setSelection((sel) => {
      const kept = sel.filter((s) => existsInPlate(plate, s))
      return kept.length === sel.length ? sel : kept
    })
  }, [plate])

  // On mount, reconstruct a plate from the URL hash (#<code>) if present.
  useEffect(() => {
    const code = window.location.hash.replace(/^#/, "")
    if (!code) return
    const decoded = decodePlate(code)
    if (decoded) {
      plateRef.current = decoded
      setPlate(decoded)
      setArchetypeSel(decoded.archetype)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Regeneration (preserves locked elements) ────────────────────────────────
  const buildPlate = useCallback(
    (over: { seed?: string; salt?: number; archetype?: string; ratio?: [number, number]; keep?: boolean }): Plate => {
      const cur = plateRef.current
      const forced = over.archetype !== undefined ? over.archetype : archetypeSel
      return generate({
        seed: over.seed ?? cur.seed,
        salt: over.salt ?? cur.salt,
        archetype: forced === "auto" ? undefined : forced,
        vibeTags: vibes.length ? vibes : undefined,
        ratio: over.ratio ?? cur.ratio,
        palette: cur.palette.source === "accent" ? accentPalette() : cur.palette,
        era: cur.era,
        post: cur.post,
        // Locks are only carried when the archetype is held (regenerate / same
        // archetype); a seed change is a fresh composition (spec §4).
        keep: over.keep
          ? {
              nodes: cur.nodes.filter((n) => n.locked),
              connectors: cur.connectors.filter((c) => c.locked),
              apparatus: cur.apparatus.filter((a) => a.locked),
            }
          : undefined,
      })
    },
    [archetypeSel, vibes],
  )

  const prev = useCallback(() => commit(() => buildPlate({ seed: `plate-${Math.max(0, seedNum - 1)}`, salt: 0 })), [commit, buildPlate, seedNum])
  const next = useCallback(() => commit(() => buildPlate({ seed: `plate-${seedNum + 1}`, salt: 0 })), [commit, buildPlate, seedNum])
  const random = useCallback(() => commit(() => buildPlate({ seed: `plate-${1000 + Math.floor(Math.random() * 9_000_000)}`, salt: 0 })), [commit, buildPlate])
  // Regenerate re-rolls the unlocked rest *within the current archetype*, keeping locks.
  const regenerate = useCallback(() => commit((p) => buildPlate({ salt: p.salt + 1, archetype: p.archetype, keep: true })), [commit, buildPlate])
  const onArchetype = useCallback(
    (id: string) => {
      setArchetypeSel(id)
      commit(() => buildPlate({ archetype: id, salt: 0, keep: true }))
    },
    [commit, buildPlate],
  )
  const onVibeToggle = useCallback(
    (tag: string) => {
      const nextVibes = vibes.includes(tag) ? vibes.filter((v) => v !== tag) : [...vibes, tag]
      setVibes(nextVibes)
      setArchetypeSel("auto") // vibe only biases the seed-driven pick
      const cur = plateRef.current
      commit(() =>
        generate({
          seed: cur.seed,
          salt: cur.salt + 1,
          vibeTags: nextVibes.length ? nextVibes : undefined,
          ratio: cur.ratio,
          palette: cur.palette.source === "accent" ? accentPalette() : cur.palette,
          era: cur.era,
          post: cur.post,
        }),
      )
    },
    [commit, vibes],
  )
  const onRatio = useCallback((r: [number, number]) => commit((p) => buildPlate({ ratio: r, archetype: p.archetype, salt: p.salt, keep: true })), [commit, buildPlate])

  // ─── Render-time settings (no geometry change) ───────────────────────────────
  const onPalette = useCallback((id: string) => commit((p) => ({ ...p, palette: id === "accent" ? accentPalette() : getPalette(id) })), [commit])
  const onEra = useCallback((id: string) => commit((p) => ({ ...p, era: id })), [commit])
  const onPost = useCallback((key: keyof PostParams, value: number) => setPlate((p) => ({ ...p, post: { ...p.post, [key]: value } })), [])
  const cycleEra = useCallback(() => {
    const i = ERAS.findIndex((e) => e.id === plateRef.current.era)
    onEra(ERAS[(i + 1) % ERAS.length].id)
  }, [onEra])
  const cyclePalette = useCallback(() => {
    const ids = [...PALETTES.map((p) => p.id), "accent"]
    const i = ids.indexOf(plateRef.current.palette.id)
    onPalette(ids[(i + 1) % ids.length])
  }, [onPalette])

  // ─── Selection + element edits ───────────────────────────────────────────────
  const onSelect = useCallback((sel: Sel | null, additive: boolean) => {
    if (!sel) return setSelection([])
    setSelection((cur) => {
      if (additive) return cur.some((s) => sameSel(s, sel)) ? cur.filter((s) => !sameSel(s, sel)) : [...cur, sel]
      return [sel]
    })
  }, [])

  const toggleLock = useCallback(
    (s: Sel) =>
      commit((p) => {
        if (s.kind === "node") return { ...p, nodes: p.nodes.map((n) => (n.id === s.id ? { ...n, locked: !n.locked } : n)) }
        if (s.kind === "connector") return { ...p, connectors: p.connectors.map((c) => (c.id === s.id ? { ...c, locked: !c.locked } : c)) }
        return { ...p, apparatus: p.apparatus.map((a) => (a.id === s.id ? { ...a, locked: !a.locked } : a)) }
      }),
    [commit],
  )

  const deleteSelected = useCallback(() => {
    if (!selection.length) return
    const nodeIds = new Set(selection.filter((s) => s.kind === "node").map((s) => s.id))
    const connIds = new Set(selection.filter((s) => s.kind === "connector").map((s) => s.id))
    const appIds = new Set(selection.filter((s) => s.kind === "apparatus").map((s) => s.id))
    commit((p) => ({
      ...p,
      nodes: p.nodes.filter((n) => !nodeIds.has(n.id)),
      connectors: p.connectors.filter((c) => !connIds.has(c.id) && !nodeIds.has(nodeOf(c.from)) && !nodeIds.has(nodeOf(c.to))),
      apparatus: p.apparatus.filter((a) => !appIds.has(a.id)),
    }))
    setSelection([])
  }, [commit, selection])

  const rerollNode = useCallback((id: string) => commit((p) => withNode(p, id, (n) => ({ ...n, seed: randSeed() }))), [commit])
  const onNodeParam = useCallback((id: string, key: string, value: number) => commit((p) => withNode(p, id, (n) => ({ ...n, params: { ...n.params, [key]: value } }))), [commit])
  const onNodePen = useCallback((id: string, role: PenRole) => commit((p) => withNode(p, id, (n) => ({ ...n, penRole: role }))), [commit])
  const onNudgeZ = useCallback(
    (id: string, dir: number) =>
      commit((p) => {
        const zs = p.nodes.map((n) => n.z)
        const target = dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1
        return { ...p, nodes: p.nodes.map((n) => (n.id === id ? { ...n, z: target } : n)) }
      }),
    [commit],
  )
  const onConnectorRoute = useCallback((id: string, route: Connector["route"]) => commit((p) => ({ ...p, connectors: p.connectors.map((c) => (c.id === id ? { ...c, route } : c)) })), [commit])
  const onConnectorLabel = useCallback((id: string, label: string) => commit((p) => ({ ...p, connectors: p.connectors.map((c) => (c.id === id ? { ...c, label: label || undefined } : c)) })), [commit])

  // ─── Drag (single undo entry per gesture) ────────────────────────────────────
  const onDragStart = useCallback(() => {
    undoRef.current.push(plateRef.current)
    if (undoRef.current.length > 60) undoRef.current.shift()
    redoRef.current = []
  }, [])
  const onMoveNode = useCallback((id: string, box: Box) => {
    const next = withNode(plateRef.current, id, (n) => ({ ...n, box }))
    plateRef.current = next
    setPlate(next)
  }, [])
  const onDragEnd = useCallback(() => {}, [])

  // ─── Export / fullscreen ─────────────────────────────────────────────────────
  const exportSVG = useCallback(() => {
    download(new Blob([renderSVG(plate, { standalone: true })], { type: "image/svg+xml" }), `plate_${plate.seed}${plate.salt ? `_${plate.salt}` : ""}.svg`)
  }, [plate])
  const exportPNG = useCallback(async () => {
    setBusy(true)
    try {
      const blob = await toPNGBlob(plate, getEra(plate.era), 3000)
      download(blob, `plate_${plate.seed}${plate.salt ? `_${plate.salt}` : ""}_${plate.era}.png`)
    } finally {
      setBusy(false)
    }
  }, [plate])
  const exportPlotter = useCallback(() => {
    download(new Blob([renderSVG(plate, { plotter: true })], { type: "image/svg+xml" }), `plate_${plate.seed}_plot.svg`)
  }, [plate])

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodePlate(plate)}`
    window.history.replaceState(null, "", `#${encodePlate(plate)}`)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked — the hash is still updated for manual copy */
    }
  }, [plate])

  const pickSeed = useCallback(
    (seed: number) => {
      setSheetOpen(false)
      commit(() => buildPlate({ seed: `plate-${seed}`, salt: 0 }))
    },
    [commit, buildPlate],
  )

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }, [])

  // ─── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.shiftKey ? redo() : undo()
        return e.preventDefault()
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "r" || e.key === "R") regenerate()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "ArrowRight") next()
      else if (e.key === "f" || e.key === "F") toggleFullscreen()
      else if (e.key === "l" || e.key === "L") selection.forEach(toggleLock)
      else if (e.key === "e" || e.key === "E") cycleEra()
      else if (e.key === "p" || e.key === "P") cyclePalette()
      else if (e.key === "?") setHelpOpen((h) => !h)
      else if (e.key === "0") onArchetype("auto")
      else if (e.key >= "1" && e.key <= "9") {
        const a = ARMATURES[parseInt(e.key, 10) - 1]
        if (a) onArchetype(a.id)
      } else if (e.key === "Backspace" || e.key === "Delete") deleteSelected()
      else if (e.key === "Escape") {
        setSelection([])
        setHelpOpen(false)
        setSheetOpen(false)
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [regenerate, prev, next, toggleFullscreen, undo, redo, selection, toggleLock, deleteSelected, cycleEra, cyclePalette, onArchetype])

  return (
    <div className={styles.shell} data-fullbleed>
      <div className={styles.topbar}>
        <span className={styles.wordmark}>Apparatus</span>
        <div className={styles.topRight}>
          <div className={styles.seedStepper}>
            <button onClick={prev} aria-label="Previous seed">◀</button>
            <span>{seedNum}</span>
            <button onClick={next} aria-label="Next seed">▶</button>
          </div>
          <button className={styles.iconBtn} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">↺</button>
          <button className={styles.iconBtn} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↻</button>
          <button className={styles.iconBtn} onClick={() => setSheetOpen(true)} title="Contact sheet" aria-label="Contact sheet">⊞</button>
          <button className={styles.iconBtn} onClick={() => setHelpOpen((h) => !h)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
          <button className={styles.iconBtn} onClick={copyLink} title="Copy permalink" aria-label="Copy permalink">{copied ? "✓ link" : "⧉ link"}</button>
          <button className={styles.iconBtn} onClick={toggleFullscreen} title="Fullscreen (F)" aria-label="Fullscreen">⤢</button>
          <button className={styles.iconBtn} onClick={exportSVG} title="Export vector SVG" aria-label="Export SVG">↧ SVG</button>
          <button className={styles.iconBtn} onClick={exportPlotter} title="Export plotter SVG (pen-ordered, stroke-only)" aria-label="Export plotter SVG">↧ PLOT</button>
          <button className={styles.iconBtn} onClick={exportPNG} disabled={busy} title="Export PNG (current era)" aria-label="Export PNG">
            {busy ? "…" : "↧ PNG"}
          </button>
        </div>
      </div>

      {sheetOpen && <ContactSheet plate={plate} baseSeed={seedNum} onPick={pickSeed} onClose={() => setSheetOpen(false)} />}

      {helpOpen && (
        <div className={styles.helpBackdrop} onClick={() => setHelpOpen(false)}>
          <div className={styles.help} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <h2>Keyboard</h2>
            <dl>
              {[
                ["R", "regenerate (keep locks)"],
                ["← / →", "previous / next seed"],
                ["1–8", "pick archetype · 0 auto"],
                ["E / P", "cycle era / palette"],
                ["L", "lock selection"],
                ["Backspace", "delete selection"],
                ["Ctrl/⌘ Z", "undo · Shift to redo"],
                ["F", "fullscreen · Esc clears"],
                ["?", "this cheatsheet"],
              ].map(([k, d]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{d}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.helpFoot}>Click a motif to select · drag to move · lock the good bits, then regenerate.</p>
          </div>
        </div>
      )}

      <p className={styles.srSummary} aria-live="polite">
        {plate.archetype} plate, {plate.nodes.length} motifs, {plate.palette.name} palette, {getEra(plate.era).name} era, {plate.ratio[0]} to {plate.ratio[1]} ratio.
      </p>

      <div className={styles.body}>
        <div className={styles.leftCol}>
          <ComposerRail
            seed={plate.seed}
            salt={plate.salt}
            onPrev={prev}
            onNext={next}
            onRandom={random}
            onRegenerate={regenerate}
            paletteId={plate.palette.id}
            onPalette={onPalette}
            era={plate.era}
            onEra={onEra}
            archetype={archetypeSel}
            onArchetype={onArchetype}
            vibes={vibes}
            onVibeToggle={onVibeToggle}
            ratio={plate.ratio}
            onRatio={onRatio}
            post={plate.post}
            onPost={onPost}
          />
          <Inspector
            plate={plate}
            selection={selection}
            onToggleLock={toggleLock}
            onDelete={deleteSelected}
            onRerollNode={rerollNode}
            onNodeParam={onNodeParam}
            onNodePen={onNodePen}
            onNudgeZ={onNudgeZ}
            onConnectorRoute={onConnectorRoute}
            onConnectorLabel={onConnectorLabel}
          />
        </div>
        <ComposerStage
          plate={plate}
          selection={selection}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onMoveNode={onMoveNode}
          onDragEnd={onDragEnd}
          ref={stageRef}
        />
      </div>

      <div className={styles.telemetry}>
        <span>seed {plate.seed}</span>
        <span>salt {plate.salt}</span>
        <span>{plate.archetype}</span>
        <span>{plate.palette.name}</span>
        <span>{getEra(plate.era).name}</span>
        <span>{plate.ratio[0]}:{plate.ratio[1]}</span>
        <span>{plate.nodes.length} nodes</span>
        {selection.length > 0 && <span>{selection.length} selected</span>}
      </div>
    </div>
  )
}
