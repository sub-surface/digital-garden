import type { BackgroundsConfig } from "@/types/backgrounds"

export const SITE_DEFAULTS = {
  "initialTheme": "light",
  "initialPalette": "complimentary",
  "initialAccent": "#427ab4",
  // satisfies (not a type annotation) checks every BgMode has a config block
  // here without widening the literal types SiteConfig infers below.
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
    },
    "murmuration": {
      "count": 460,
      "maxSpeed": 2.4,
      "cohere": 0.001,
      "wind": 0.05,
      "opacity": 0.34
    },
    "isometric": {
      "count": 14,
      "spin": 1,
      "parallax": 1,
      "opacity": 1
    },
    "orrery": {
      "timelapse": 0,
      "labels": 1,
      "opacity": 1
    },
    "lightning": {
      "frequency": 9,
      "branching": 0.5,
      "glow": 1,
      "opacity": 0.6
    },
    "attractor": {
      "speed": 1.0,
      "rotSpeed": 0.6,
      "trail": 1600,
      "morph": 45,
      "opacity": 0.4
    },
    "cartography": {
      "lines": 16,
      "speed": 0.6,
      "relief": 1.6,
      "elevation": 0.0022,
      "opacity": 0.3
    },
    "prose": {
      "size": 15,
      "hold": 14,
      "drift": 1,
      "opacity": 0.5
    },
    "sediment": {
      "rate": 1.5,
      "size": 12,
      "opacity": 0.5
    },
    "palimpsest": {
      "layers": 3,
      "speed": 1,
      "size": 17,
      "opacity": 0.5
    },
    "rivers": {
      "measure": 420,
      "size": 14,
      "flow": 1,
      "opacity": 0.5
    },
    "cutup": {
      "lines": 9,
      "interval": 3.5,
      "size": 16,
      "opacity": 0.5
    },
    "concordance": {
      "stars": 700,
      "twinkle": 1,
      "opacity": 0.6
    },
    "teletype": {
      "speed": 14,
      "size": 13,
      "opacity": 0.45
    }
  } satisfies BackgroundsConfig
}

export type SiteConfig = typeof SITE_DEFAULTS
