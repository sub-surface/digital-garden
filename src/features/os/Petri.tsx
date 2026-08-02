import { useEffect, useMemo, useRef, useState } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useOS } from "./osStore"
import type { AppProps } from "./appTypes"
import {
  PETRI_VERSION,
  actOnPetri,
  createPetri,
  normalizePetri,
  petriMood,
  petriStage,
  petriTemperament,
  settlePetri,
  type PetriAction,
  type PetriMood,
  type PetriState,
} from "./petriModel"
import styles from "./Petri.module.scss"

interface PetriStore {
  pet: PetriState
  care: (action: PetriAction, now?: number) => void
  rename: (name: string) => void
  hatch: (now?: number) => void
}

export const usePetriStore = create<PetriStore>()(
  persist(
    (set) => ({
      pet: createPetri(),
      care: (action, now = Date.now()) => set((state) => ({ pet: actOnPetri(state.pet, action, now) })),
      rename: (requested) => set((state) => ({
        pet: { ...state.pet, name: requested.trim().slice(0, 20) || "Mote" },
      })),
      hatch: (now = Date.now()) => set({ pet: createPetri(now, (now ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) }),
    }),
    {
      name: "subsurfaces95-petri",
      version: PETRI_VERSION,
      migrate: (persisted) => {
        const previous = persisted && typeof persisted === "object"
          ? persisted as Partial<PetriStore>
          : {}
        return { ...previous, pet: normalizePetri(previous.pet) } as PetriStore
      },
      partialize: (state) => ({ pet: state.pet }) as PetriStore,
    },
  ),
)

const NEED_LABELS = {
  fullness: "Full",
  joy: "Joy",
  energy: "Rest",
  cleanliness: "Clean",
} as const

function NeedBar({ label, value }: { label: string; value: number }) {
  const amount = Math.round(value)
  return (
    <div className={styles.need}>
      <span>{label}</span>
      <div className={styles.needTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={amount}>
        <span style={{ width: `${amount}%` }} />
      </div>
      <output>{amount}</output>
    </div>
  )
}

function petMessage(
  mood: PetriMood,
  music: { playing: boolean; title?: string },
  hour: number,
  windows: number,
  reaction: PetriAction | null,
) {
  if (reaction === "feed") return "a perfect little crumb. no notes."
  if (reaction === "pet") return "your cursor is warm."
  if (reaction === "play") return "again! but perhaps after one dignified breath."
  if (reaction === "clean") return "squeaky agar! I can see my reflection."
  if (reaction === "nap") return "I dreamed I was a much larger dot."
  if (reaction === "dance") return "I have invented a move with no name."
  if (music.playing) return music.title ? `wibble wibble… this one is called “${music.title}”?` : "the room is humming!"
  if (mood === "dormant") return "just resting in a very small way. I will wake up."
  if (mood === "peckish") return "could a crumb fall into this dish by coincidence?"
  if (mood === "lonely") return "I kept a place for your pointer."
  if (mood === "mucky") return "the ecosystem is becoming… textural."
  if (mood === "sleepy") return "my eyelids have become conceptually heavy."
  if (mood === "radiant") return "today I contain several excellent possibilities."
  if (hour < 6 || hour >= 23) return "a secret hour! everything is quieter at this size."
  if (windows >= 6) return "so many windows. are they all terrariums?"
  return "I have been considering the shape of the mouse pointer."
}

export function PetriApp(_props: AppProps) {
  const stored = usePetriStore((state) => state.pet)
  const care = usePetriStore((state) => state.care)
  const rename = usePetriStore((state) => state.rename)
  const hatch = usePetriStore((state) => state.hatch)
  const windowCount = useOS((state) => state.windows.length)
  const { isPlaying, currentTrack } = useMusic()
  const [now, setNow] = useState(() => Date.now())
  const [draftName, setDraftName] = useState(stored.name)
  const [reaction, setReaction] = useState<PetriAction | null>(null)
  const visitedRef = useRef(false)
  const dishRef = useRef<HTMLDivElement>(null)
  const reactionTimerRef = useRef<number | null>(null)
  const pet = useMemo(() => settlePetri(stored, now), [now, stored])
  const mood = petriMood(pet)
  const stage = petriStage(pet)
  const temperament = petriTemperament(pet)
  const age = Math.max(1, Math.floor((now - pet.bornAt) / 86_400_000) + 1)
  const hue = pet.seed % 360
  const message = petMessage(
    mood,
    { playing: isPlaying, title: currentTrack?.title },
    new Date(now).getHours(),
    windowCount,
    reaction,
  )

  useEffect(() => {
    if (visitedRef.current) return
    visitedRef.current = true
    const visitTime = Date.now()
    care("visit", visitTime)
    setNow(visitTime)
  }, [care])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => () => {
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current)
  }, [])

  useEffect(() => setDraftName(stored.name), [stored.name])

  const act = (action: PetriAction) => {
    const actionTime = Date.now()
    care(action, actionTime)
    setNow(actionTime)
    setReaction(action)
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current)
    reactionTimerRef.current = window.setTimeout(() => {
      setReaction(null)
      reactionTimerRef.current = null
    }, 2_400)
  }

  const trackPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const dish = dishRef.current
    if (!dish) return
    const rect = dish.getBoundingClientRect()
    const x = Math.max(-3, Math.min(3, (event.clientX - rect.left) / rect.width * 6 - 3))
    const y = Math.max(-2, Math.min(2, (event.clientY - rect.top) / rect.height * 4 - 2))
    dish.style.setProperty("--look-x", `${x.toFixed(2)}px`)
    dish.style.setProperty("--look-y", `${y.toFixed(2)}px`)
  }

  return (
    <div
      className={styles.root}
      data-mood={mood}
      data-stage={stage}
      data-dancing={isPlaying || undefined}
      style={{ "--pet-hue": hue } as React.CSSProperties}
    >
      <header className={styles.header}>
        <label>
          Specimen
          <input
            value={draftName}
            maxLength={20}
            aria-label="Pet name"
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => rename(draftName)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { rename(draftName); event.currentTarget.blur() }
            }}
          />
        </label>
        <span><strong>{stage.toUpperCase()}</strong><small>{temperament} · day {age}</small></span>
      </header>

      <div className={styles.main}>
        <section className={styles.habitat}>
          <div className={styles.speech} aria-live="polite">{message}</div>
          <div
            ref={dishRef}
            className={styles.dish}
            onPointerMove={trackPointer}
            onPointerLeave={() => {
              dishRef.current?.style.setProperty("--look-x", "0px")
              dishRef.current?.style.setProperty("--look-y", "0px")
            }}
            onDoubleClick={() => act("pet")}
            title="Double-click to pet"
          >
            <span className={styles.bubble} /><span className={styles.bubble} /><span className={styles.bubble} />
            <div className={styles.creature} key={`${stage}-${pet.nonce}`} role="img" aria-label={`${pet.name}, a ${mood} ${stage}`}>
              <span className={styles.petal} /><span className={styles.petal} /><span className={styles.petal} /><span className={styles.petal} />
              <span className={styles.sprout}><i /><b /></span>
              <span className={styles.body}>
                <span className={styles.eye}><i /></span>
                <span className={styles.eye}><i /></span>
                <span className={styles.mouth} />
                <span className={styles.cheek} /><span className={styles.cheek} />
              </span>
              <span className={styles.shadow} />
            </div>
          </div>
          {isPlaying && <div className={styles.nowPlaying}>♫ dancing to {currentTrack?.title ?? "the music"}</div>}
        </section>

        <aside className={styles.carePanel}>
          <div className={styles.mood}><span>Mood</span><strong>{mood.toUpperCase()}</strong></div>
          {(Object.keys(NEED_LABELS) as Array<keyof typeof NEED_LABELS>).map((need) => (
            <NeedBar key={need} label={NEED_LABELS[need]} value={pet.needs[need]} />
          ))}
          <NeedBar label="Bond" value={pet.bond} />
          <div className={styles.growth}>
            <span>Growth</span><strong>{Math.round(pet.growth)}%</strong>
            <small>Care, play and music reveal new forms.</small>
          </div>
        </aside>
      </div>

      <div className={styles.actions} aria-label="Pet care">
        <button type="button" onClick={() => act("feed")}><span>●</span>Feed</button>
        <button type="button" onClick={() => act("pet")}><span>♥</span>Pet</button>
        <button type="button" onClick={() => act("play")}><span>↝</span>Play</button>
        <button type="button" onClick={() => act("clean")}><span>◇</span>Wash</button>
        <button type="button" onClick={() => act("nap")}><span>z</span>Nap</button>
        <button type="button" onClick={() => act("dance")} disabled={!isPlaying} title={isPlaying ? "Dance together" : "Play music first"}><span>♫</span>Dance</button>
      </div>

      <footer className={styles.footer}>
        <span>VISITS {pet.visits}</span>
        <span>LOCAL SPECIMEN · NEVER DIES</span>
        <button type="button" onClick={() => {
          if (!window.confirm(`Hatch a new pet? ${pet.name}'s current state will be replaced.`)) return
          const hatchTime = Date.now()
          if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current)
          reactionTimerRef.current = null
          setReaction(null)
          hatch(hatchTime)
          setNow(hatchTime)
        }}>New egg…</button>
      </footer>
    </div>
  )
}
