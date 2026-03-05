export const SITE_DEFAULTS = {
  // Global UI
  initialTheme: "dark" as "light" | "dark",
  initialPalette: "complimentary" as "mono" | "complimentary",
  initialAccent: "#b4424c",
  masterOpacity: 1.0,
  
  // Background Mode Specifics
  backgrounds: {
    vectors: {
      step: 60,
      rx: 24,
      ry: 1,
      scale: 0.0008,
      range: 1.2,
      speed: 0.094,
      vortex: 0.9,
      radius: 110,
    },
    graph: {
      drift: 0.5,
      linkWidth: 1,
      linkOpacity: 0.05,
      nodeSize: 2,
      nodeHoverSize: 4,
      nodeOpacity: 0.15,
      nodeHoverOpacity: 0.4,
    },
    dots: {
      step: 40,
      minSize: 2,
      maxSize: 6,
      opacity: 0.2,
      speed: 0.05,
      scale: 0.001,
    },
    terminal: {
      step: 50,
      opacity: 0.15,
      speed: 0.08,
      scale: 0.0008,
    }
  }
}

export type SiteConfig = typeof SITE_DEFAULTS
