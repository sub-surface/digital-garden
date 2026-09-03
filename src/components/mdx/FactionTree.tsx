import { Link } from "@tanstack/react-router"
import { useStore } from "@/store"
import { resolveSlug } from "@/lib/content-loader"
import styles from "./FactionTree.module.scss"

interface FactionItem {
  id: string
  title: string
  tag: string
  accent: string
  thesis: string
  members: Array<{ name: string; slug: string; role?: string }>
  keyArtifacts: Array<{ name: string; slug: string }>
}

const FACTIONS: FactionItem[] = [
  {
    id: "realists",
    title: "The Realists & Empiricists",
    tag: "Correspondence & Biometrics",
    accent: "var(--color-accent, #a3be8c)",
    thesis: "Truth is correspondence with external reality. Biometric and material baselines dictate outcomes before discursive framing begins.",
    members: [
      { name: "Hugh Chungus", slug: "hughchungus", role: "Realist Corner · Biophile" },
      { name: "Zack", slug: "zack", role: "Caliper Theorist · Spawnpill" },
      { name: "FenceJumper", slug: "The Moggening", role: "Material Baseline" },
    ],
    keyArtifacts: [
      { name: "The Moggening", slug: "The Moggening" },
      { name: "The Evolution Deliberation", slug: "The Evolution Deliberation" },
    ],
  },
  {
    id: "pragmatists",
    title: "The Pragmatists & Rortians",
    tag: "Warranted Assertibility",
    accent: "#ebcb8b",
    thesis: "Truth is social justification: what our peers let us get away with saying before dinner. Inquiry as organism-environment interaction.",
    members: [
      { name: "Anthony Quigley", slug: "Quigley", role: "Deweyan Champion · 78.4% Answer Rate" },
    ],
    keyArtifacts: [
      { name: "The Six Criteria of Warrant", slug: "The Six Criteria of Warrant" },
      { name: "The Warranted Assertibility Wars", slug: "The Warranted Assertibility Wars" },
    ],
  },
  {
    id: "continental",
    title: "Continental & Spinozists",
    tag: "Immanence & Difference",
    accent: "#b48ead",
    thesis: "Radical immanence, univocity of Being, rhizomatic difference, and foundherentist crossword puzzles over foundationalism.",
    members: [
      { name: "Charlie (Willow)", slug: "Charlie(Willow)", role: "System Builder · HegelBot" },
      { name: "Ape", slug: "Ape", role: "Foundherentist Epistemology" },
      { name: "dot", slug: "dot", role: "Spinozist Wing · DeLanda Envoy" },
      { name: "Lizzie", slug: "lizzie", role: "Messiah of the Covenant" },
    ],
    keyArtifacts: [
      { name: "The Dragons Covenant", slug: "The Dragons Covenant" },
      { name: "The RuneScape Renaissance", slug: "The RuneScape Renaissance" },
    ],
  },
  {
    id: "analytic",
    title: "The Analytic Purists",
    tag: "Logic & Forensic Skepticism",
    accent: "#88c0d0",
    thesis: "Counterexample demands, semantic rigor, forensic metric verification, and the preservation of institutional conscience.",
    members: [
      { name: "Chair", slug: "chair", role: "Formal Counterexample Demand" },
      { name: "aurasurfer", slug: "aurasurfer", role: "Auditor · Coined Size 2 Chuckle" },
      { name: "Janne", slug: "janne", role: "The Zoo Principle · Ethics" },
    ],
    keyArtifacts: [
      { name: "Size 2 Chuckle", slug: "Size 2 Chuckle" },
      { name: "The Voice Channel Jurisprudence", slug: "The Voice Channel Jurisprudence" },
    ],
  },
]

export function FactionTree() {
  const contentIndex = useStore((s) => s.contentIndex)

  const getHref = (rawSlug: string) => {
    const resolved = contentIndex ? (resolveSlug(rawSlug, contentIndex) ?? rawSlug) : rawSlug
    return `/${resolved.replace(/^\//, "").replace(/\s+/g, "-")}`
  }

  return (
    <div className={styles.treeContainer} role="region" aria-label="Phil Chat Faction Alignment Map">
      {/* Root Node */}
      <div className={styles.rootWrapper}>
        <div className={styles.rootNode}>
          <span className={styles.rootKicker}>Canonical Alignment Map</span>
          <h3 className={styles.rootTitle}>PHIL CHAT</h3>
          <span className={styles.rootSub}>Epistemology, Method & Channel Jurisprudence</span>
        </div>
      </div>

      {/* SVG Connector Bus */}
      <div className={styles.svgBusWrapper} aria-hidden="true">
        <svg className={styles.svgBus} viewBox="0 0 1000 70" preserveAspectRatio="none">
          {/* Vertical stem from root */}
          <line x1="500" y1="0" x2="500" y2="35" className={styles.busLine} />
          {/* Horizontal distribution bar */}
          <line x1="125" y1="35" x2="875" y2="35" className={styles.busLine} />
          {/* 4 Drops into the 4 columns */}
          <line x1="125" y1="35" x2="125" y2="70" className={styles.busLine} markerEnd="url(#busArrow)" />
          <line x1="375" y1="35" x2="375" y2="70" className={styles.busLine} markerEnd="url(#busArrow)" />
          <line x1="625" y1="35" x2="625" y2="70" className={styles.busLine} markerEnd="url(#busArrow)" />
          <line x1="875" y1="35" x2="875" y2="70" className={styles.busLine} markerEnd="url(#busArrow)" />
          <defs>
            <marker id="busArrow" viewBox="0 0 6 6" refX="3" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 3 6 L 6 0 z" fill="currentColor" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* 4 Faction Columns */}
      <div className={styles.columnsGrid}>
        {FACTIONS.map((faction) => (
          <div key={faction.id} className={styles.factionCard} style={{ "--faction-accent": faction.accent } as React.CSSProperties}>
            <div className={styles.cardHeader}>
              <span className={styles.factionTag}>{faction.tag}</span>
              <h4 className={styles.factionTitle}>{faction.title}</h4>
            </div>

            <p className={styles.factionThesis}>{faction.thesis}</p>

            <div className={styles.sectionDivider} />

            <div className={styles.rosterSection}>
              <span className={styles.sectionLabel}>Key Chatters</span>
              <ul className={styles.memberList}>
                {faction.members.map((m) => (
                  <li key={m.slug} className={styles.memberItem}>
                    <Link to={getHref(m.slug) as any} className={styles.memberLink}>
                      {m.name}
                    </Link>
                    {m.role && <span className={styles.memberRole}>{m.role}</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.artifactSection}>
              <span className={styles.sectionLabel}>Key Engagements</span>
              <div className={styles.artifactTags}>
                {faction.keyArtifacts.map((a) => (
                  <Link key={a.slug} to={getHref(a.slug) as any} className={styles.artifactPill}>
                    {a.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
