import type { PostParams } from "@/lib/composer/types"
import { PALETTES } from "@/lib/composer/pens"
import { ERAS } from "@/lib/composer/eras"
import { ARMATURES, ALL_VIBES } from "@/lib/composer/armatures"
import styles from "./ComposerRail.module.scss"

const RATIOS: { r: [number, number]; label: string }[] = [
  { r: [1, 1], label: "1:1" },
  { r: [4, 5], label: "4:5" },
  { r: [2, 3], label: "2:3" },
  { r: [3, 4], label: "3:4" },
  { r: [16, 9], label: "16:9" },
]

/**
 * The control rail. Compose (seed stepper + regenerate/random + archetype),
 * Palette (named + site-accent), Era (device picker), Post (ink/contrast/
 * jitter/weight sliders). Controls follow SIGIL's idiom — `--font-code`, `1px
 * solid var(--color-border)`, accent `data-active` state.
 */
export interface RailProps {
  seed: string
  salt: number
  onPrev: () => void
  onNext: () => void
  onRandom: () => void
  onRegenerate: () => void
  paletteId: string
  onPalette: (id: string) => void
  era: string
  onEra: (id: string) => void
  archetype: string // "auto" or an armature id
  onArchetype: (id: string) => void
  vibes: string[]
  onVibeToggle: (tag: string) => void
  ratio: [number, number]
  onRatio: (r: [number, number]) => void
  post: PostParams
  onPost: (key: keyof PostParams, value: number) => void
}

const POST_CONTROLS: { key: keyof PostParams; label: string; min: number; max: number; step: number }[] = [
  { key: "inkBias", label: "ink", min: -0.35, max: 0.35, step: 0.01 },
  { key: "contrast", label: "contrast", min: 0.5, max: 2.5, step: 0.05 },
  { key: "handJitter", label: "hand", min: 0, max: 1, step: 0.05 },
  { key: "lineWeight", label: "weight", min: 0.5, max: 2, step: 0.05 },
]

export function ComposerRail(props: RailProps) {
  return (
    <div className={styles.rail}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Compose</h2>
        <div className={styles.seedRow}>
          <button onClick={props.onPrev} aria-label="Previous seed" title="Previous seed (←)">
            ◀
          </button>
          <span className={styles.seedLabel} title="current seed">
            {props.seed}
          </span>
          <button onClick={props.onNext} aria-label="Next seed" title="Next seed (→)">
            ▶
          </button>
        </div>
        <div className={styles.btnRow}>
          <button onClick={props.onRegenerate} title="Re-roll everything (R)">
            ⟳ Regenerate
          </button>
          <button onClick={props.onRandom} title="Jump to a random seed">
            Random
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Archetype</h2>
        <div className={styles.chips}>
          <button
            data-active={props.archetype === "auto" || undefined}
            onClick={() => props.onArchetype("auto")}
            title="Let the seed choose"
          >
            auto
          </button>
          {ARMATURES.map((a) => (
            <button
              key={a.id}
              data-active={props.archetype === a.id || undefined}
              onClick={() => props.onArchetype(a.id)}
              title={a.tags.join(" · ")}
            >
              {a.name}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Vibe</h2>
        <div className={styles.chips}>
          {ALL_VIBES.map((v) => (
            <button
              key={v}
              data-active={props.vibes.includes(v) || undefined}
              onClick={() => props.onVibeToggle(v)}
              title="Bias generation toward this vibe (archetype → auto)"
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Palette</h2>
        <div className={styles.chips}>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              data-active={props.paletteId === p.id || undefined}
              onClick={() => props.onPalette(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            data-active={props.paletteId === "accent" || undefined}
            onClick={() => props.onPalette("accent")}
            title="Match the current site accent theme"
          >
            Site accent
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Era</h2>
        <div className={styles.chips}>
          {ERAS.map((e) => (
            <button
              key={e.id}
              data-active={props.era === e.id || undefined}
              onClick={() => props.onEra(e.id)}
              title={e.vector ? "vector (no dither)" : `${e.palette.length}-colour · ${e.dither}`}
            >
              {e.name}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Ratio</h2>
        <div className={styles.chips}>
          {RATIOS.map(({ r, label }) => (
            <button
              key={label}
              data-active={(props.ratio[0] === r[0] && props.ratio[1] === r[1]) || undefined}
              onClick={() => props.onRatio(r)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Post</h2>
        {POST_CONTROLS.map((c) => (
          <label key={c.key} className={styles.slider}>
            <span>{c.label}</span>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={props.post[c.key]}
              onChange={(e) => props.onPost(c.key, parseFloat(e.target.value))}
            />
            <span className={styles.sliderVal}>{props.post[c.key].toFixed(2)}</span>
          </label>
        ))}
      </section>
    </div>
  )
}
