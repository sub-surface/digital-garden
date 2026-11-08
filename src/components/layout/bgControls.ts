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
  schematic: [
    { key: "anchors", label: "Anchors", min: 3, max: 20, step: 1 },
    { key: "driftSpeed", label: "Drift speed", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  isometric: [
    { key: "count", label: "Cubes", min: 3, max: 30, step: 1 },
    { key: "spin", label: "Spin", min: 0, max: 3, step: 0.1 },
    { key: "parallax", label: "Parallax", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  orrery: [
    { key: "rings", label: "Rings", min: 2, max: 12, step: 1 },
    { key: "spin", label: "Spin", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  "plate-scan": [
    { key: "panSpeed", label: "Pan speed", min: 0, max: 5, step: 0.1 },
    { key: "scanSpeed", label: "Scan speed", min: 0, max: 5, step: 0.1 },
    { key: "cell", label: "Grain", min: 2, max: 10, step: 1 },
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
  dendrite: [
    { key: "branches", label: "Roots", min: 1, max: 8, step: 1 },
    { key: "speed", label: "Growth speed", min: 0.2, max: 3, step: 0.1 },
    { key: "branchChance", label: "Branching", min: 0.01, max: 0.2, step: 0.01 },
    { key: "curl", label: "Curvature", min: 0.1, max: 2, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  lorenz: [
    { key: "flowType", label: "Attractor (0:Lorenz 1:Rössler 2:Aizawa 3:Thomas)", min: 0, max: 3, step: 1 },
    { key: "speed", label: "Time step", min: 0.2, max: 3, step: 0.1 },
    { key: "rotSpeed", label: "Rotation", min: 0, max: 2, step: 0.1 },
    { key: "trail", label: "Ribbon length", min: 300, max: 2500, step: 100 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  cartography: [
    { key: "lines", label: "Contour count", min: 4, max: 24, step: 1 },
    { key: "speed", label: "Undulation speed", min: 0.1, max: 2, step: 0.05 },
    { key: "relief", label: "Terrain relief", min: 0.5, max: 4, step: 0.1 },
    { key: "elevation", label: "Frequency", min: 0.0005, max: 0.006, step: 0.0005 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
}
