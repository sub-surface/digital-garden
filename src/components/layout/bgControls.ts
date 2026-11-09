/** Slider schema for the settings panel's background tuning (one entry per ambient mode). */
export interface BgControl { key: string; label: string; min: number; max: number; step: number }

// Per-mode dev controls. Schema-driven so adding a mode is one entry here +
// its config block in site-defaults — the panel renders whatever it finds.
export const BG_CONTROLS: Record<string, BgControl[]> = {
  murmuration: [
    { key: "count", label: "Flock size", min: 100, max: 800, step: 10 },
    { key: "maxSpeed", label: "Max speed", min: 1, max: 5, step: 0.1 },
    { key: "cohere", label: "Cohesion", min: 0, max: 0.005, step: 0.0001 },
    { key: "wind", label: "Wind", min: 0, max: 0.2, step: 0.005 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  chamber: [
    { key: "emitters", label: "Emitters", min: 1, max: 8, step: 1 },
    { key: "maxTracks", label: "Max tracks", min: 20, max: 200, step: 5 },
    { key: "curl", label: "Curl", min: 0, max: 0.2, step: 0.005 },
    { key: "spawnRate", label: "Spawn rate", min: 0.02, max: 0.6, step: 0.01 },
    { key: "glyphChance", label: "Glyphs", min: 0, max: 1, step: 0.05 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 1, step: 0.01 },
  ],
  isometric: [
    { key: "count", label: "Solids", min: 3, max: 40, step: 1 },
    { key: "spin", label: "Spin", min: 0, max: 3, step: 0.1 },
    { key: "parallax", label: "Parallax", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  orrery: [
    { key: "timelapse", label: "Time-lapse (days/s, 0 = today)", min: 0, max: 60, step: 1 },
    { key: "labels", label: "Names", min: 0, max: 1, step: 1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  vectors: [
    { key: "speed", label: "Speed", min: 0.01, max: 0.5, step: 0.001 },
    { key: "scale", label: "Scale", min: 0.0001, max: 0.005, step: 0.0001 },
    { key: "step", label: "Density", min: 20, max: 100, step: 1 },
    { key: "vortex", label: "Vortex", min: 0, max: 2, step: 0.05 },
  ],
  dots: [
    { key: "opacity", label: "Opacity", min: 0.01, max: 1, step: 0.01 },
    { key: "minSize", label: "Min size", min: 0.5, max: 10, step: 0.5 },
    { key: "maxSize", label: "Max size", min: 1, max: 20, step: 0.5 },
    { key: "speed", label: "Speed", min: 0.01, max: 0.3, step: 0.005 },
  ],
  terminal: [
    { key: "opacity", label: "Opacity", min: 0.01, max: 1, step: 0.01 },
    { key: "step", label: "Density", min: 10, max: 100, step: 1 },
    { key: "speed", label: "Speed", min: 0.01, max: 0.3, step: 0.005 },
  ],
  graph: [
    { key: "linkOpacity", label: "Link opacity", min: 0.01, max: 0.2, step: 0.01 },
    { key: "nodeSize", label: "Node size", min: 1, max: 10, step: 0.5 },
    { key: "drift", label: "Drift", min: 0, max: 2, step: 0.1 },
  ],
  lightning: [
    { key: "frequency", label: "Strikes / min", min: 1, max: 40, step: 1 },
    { key: "branching", label: "Branching", min: 0, max: 1, step: 0.05 },
    { key: "glow", label: "Glow", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  attractor: [
    { key: "speed", label: "Time step", min: 0.2, max: 3, step: 0.1 },
    { key: "rotSpeed", label: "Rotation", min: 0, max: 2, step: 0.1 },
    { key: "trail", label: "Ribbon length", min: 300, max: 3000, step: 100 },
    { key: "morph", label: "Seconds per attractor", min: 10, max: 180, step: 5 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  cartography: [
    { key: "lines", label: "Contour levels", min: 6, max: 30, step: 1 },
    { key: "speed", label: "Drift speed", min: 0.1, max: 2, step: 0.05 },
    { key: "relief", label: "Relief", min: 0.5, max: 4, step: 0.1 },
    { key: "elevation", label: "Hill size", min: 0.0008, max: 0.006, step: 0.0002 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  prose: [
    { key: "size", label: "Type size", min: 10, max: 28, step: 1 },
    { key: "hold", label: "Hold (s)", min: 4, max: 40, step: 1 },
    { key: "drift", label: "Scatter", min: 0.2, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  sediment: [
    { key: "rate", label: "Words / s", min: 0.2, max: 6, step: 0.1 },
    { key: "size", label: "Type size", min: 8, max: 20, step: 1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  palimpsest: [
    { key: "layers", label: "Layers", min: 1, max: 5, step: 1 },
    { key: "speed", label: "Speed", min: 0.2, max: 3, step: 0.1 },
    { key: "size", label: "Type size", min: 10, max: 30, step: 1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  rivers: [
    { key: "measure", label: "Column width", min: 220, max: 800, step: 10 },
    { key: "size", label: "Type size", min: 10, max: 22, step: 1 },
    { key: "flow", label: "Flow", min: 0.2, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  cutup: [
    { key: "lines", label: "Lines", min: 3, max: 18, step: 1 },
    { key: "interval", label: "Seconds per cut", min: 1, max: 12, step: 0.5 },
    { key: "size", label: "Type size", min: 10, max: 28, step: 1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  concordance: [
    { key: "stars", label: "Stars", min: 100, max: 2000, step: 50 },
    { key: "twinkle", label: "Twinkle", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  teletype: [
    { key: "speed", label: "Characters / s", min: 2, max: 60, step: 1 },
    { key: "size", label: "Type size", min: 9, max: 20, step: 1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
}
