/**
 * OG card facts shared by the generator (scripts/og-gen.ts) and the Worker
 * (src/worker/meta.ts). Dependency-free.
 */
export const OG_WIDTH = 1200
export const OG_HEIGHT = 630
/** Essays with a header image get the taller framed "plate" card. */
export const OG_PLATE_HEIGHT = 750

interface PlateFacts { image?: string; cover?: string; poster?: string; ogLayout?: string }

/** True when a note's card is the plate: an essay in Writing/ with an image and no explicit `og-layout`. */
export function isPlateCard(slug: string, note: PlateFacts): boolean {
  return /^writing\//i.test(slug) && Boolean(note.image || note.cover || note.poster) && !note.ogLayout
}
