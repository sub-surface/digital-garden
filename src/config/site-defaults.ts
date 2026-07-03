export const SITE_DEFAULTS = {
  "initialTheme": "light",
  "initialPalette": "complimentary",
  "initialAccent": "#427ab4",
  "masterOpacity": 1,
  "backgrounds": {
    "vectors": {
      "step": 54,
      "rx": 24,
      "ry": 1,
      "scale": 0.0009,
      "range": 1.2,
      "speed": 0.215,
      "vortex": 0.9,
      "radius": 110
    },
    "graph": {
      "drift": 1,
      "linkWidth": 1,
      "linkOpacity": 0.1,
      "nodeSize": 2,
      "nodeHoverSize": 4,
      "nodeOpacity": 0.15,
      "nodeHoverOpacity": 0.4
    },
    "dots": {
      "step": 40,
      "minSize": 3,
      "maxSize": 10,
      "opacity": 0.74,
      "speed": 0.05,
      "scale": 0.001
    },
    "terminal": {
      "step": 71,
      "opacity": 0.67,
      "speed": 0.08,
      "scale": 0.0008
    },
    "chamber": {
      "emitters": 3,
      "spawnRate": 0.18,
      "maxTracks": 90,
      "steps": 34,
      "stepLen": 7,
      "fieldScale": 0.0016,
      "drift": 0.12,
      "curl": 0.06,
      "fade": 0.006,
      "dot": 1.3,
      "gap": 2,
      "opacity": 0.5,
      "spot": 0.15,
      "glyphChance": 0.15,
      "reticle": true
    }
  }
}

export type SiteConfig = typeof SITE_DEFAULTS
