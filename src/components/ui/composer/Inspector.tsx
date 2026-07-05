import type { Connector, Node, PenRole, Plate } from "@/lib/composer/types"
import { PEN_ROLES } from "@/lib/composer/types"
import { getMotif } from "@/lib/composer/motifs"
import type { Sel } from "./selection"
import { elementOf } from "./selection"
import styles from "./Inspector.module.scss"

const ROUTES: Connector["route"][] = ["leader", "manhattan", "arc", "dotted", "stream", "text-path"]

export interface InspectorProps {
  plate: Plate
  selection: Sel[]
  onToggleLock: (s: Sel) => void
  onDelete: () => void
  onRerollNode: (id: string) => void
  onNodeParam: (id: string, key: string, value: number) => void
  onNodePen: (id: string, role: PenRole) => void
  onNudgeZ: (id: string, dir: number) => void
  onConnectorRoute: (id: string, route: Connector["route"]) => void
  onConnectorLabel: (id: string, label: string) => void
}

export function Inspector(props: InspectorProps) {
  const { plate, selection } = props

  if (selection.length === 0) {
    return (
      <div className={styles.inspector}>
        <h2 className={styles.heading}>Inspector</h2>
        <p className={styles.hint}>Click an element to edit it. Drag a motif to move it. Lock the good bits, then re-roll the rest.</p>
      </div>
    )
  }

  if (selection.length > 1) {
    return (
      <div className={styles.inspector}>
        <h2 className={styles.heading}>{selection.length} selected</h2>
        <div className={styles.btnRow}>
          <button onClick={() => selection.forEach(props.onToggleLock)}>lock / unlock</button>
          <button onClick={props.onDelete} className={styles.danger}>
            delete
          </button>
        </div>
      </div>
    )
  }

  const sel = selection[0]
  const el = elementOf(plate, sel)
  if (!el) return <div className={styles.inspector} />
  const locked = (el as { locked: boolean }).locked

  return (
    <div className={styles.inspector}>
      <h2 className={styles.heading}>
        {sel.kind}
        <span className={styles.elId}>{sel.id}</span>
      </h2>

      <div className={styles.btnRow}>
        <button data-active={locked || undefined} onClick={() => props.onToggleLock(sel)}>
          {locked ? "🔒 locked" : "lock"}
        </button>
        {sel.kind === "node" && <button onClick={() => props.onRerollNode(sel.id)}>⟳ re-roll</button>}
        <button onClick={props.onDelete} className={styles.danger}>
          delete
        </button>
      </div>

      {sel.kind === "node" && <NodeControls node={el as Node} {...props} />}
      {sel.kind === "connector" && <ConnectorControls conn={el as Connector} {...props} />}
      {sel.kind === "apparatus" && <p className={styles.hint}>Apparatus “{(el as { kind: string }).kind}” — lock to keep it through regeneration.</p>}
    </div>
  )
}

function NodeControls({ node, ...props }: { node: Node } & InspectorProps) {
  const def = getMotif(node.motif)
  return (
    <>
      <div className={styles.field}>
        <span className={styles.label}>motif</span>
        <span className={styles.value}>{def?.name ?? node.motif}</span>
      </div>

      {def?.params.map((p) => (
        <label key={p.key} className={styles.slider}>
          <span>{p.label}</span>
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={(node.params[p.key] as number) ?? p.default}
            onChange={(e) => props.onNodeParam(node.id, p.key, parseFloat(e.target.value))}
          />
          <span className={styles.sliderVal}>{Number((node.params[p.key] as number) ?? p.default).toFixed(2)}</span>
        </label>
      ))}

      <div className={styles.field}>
        <span className={styles.label}>pen</span>
        <div className={styles.chips}>
          {PEN_ROLES.map((role) => (
            <button key={role} data-active={node.penRole === role || undefined} onClick={() => props.onNodePen(node.id, role)}>
              {role}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>order</span>
        <div className={styles.btnRow}>
          <button onClick={() => props.onNudgeZ(node.id, 1)}>bring forward</button>
          <button onClick={() => props.onNudgeZ(node.id, -1)}>send back</button>
        </div>
      </div>
    </>
  )
}

function ConnectorControls({ conn, ...props }: { conn: Connector } & InspectorProps) {
  return (
    <>
      <div className={styles.field}>
        <span className={styles.label}>route</span>
        <div className={styles.chips}>
          {ROUTES.map((r) => (
            <button key={r} data-active={conn.route === r || undefined} onClick={() => props.onConnectorRoute(conn.id, r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>label</span>
        <input
          type="text"
          className={styles.textInput}
          value={conn.label ?? ""}
          placeholder="(none)"
          onChange={(e) => props.onConnectorLabel(conn.id, e.target.value)}
        />
      </label>
    </>
  )
}
