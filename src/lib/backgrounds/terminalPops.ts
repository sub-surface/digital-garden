import type { BgState } from "@/types/backgrounds"
import type { SiteConfig } from "@/config/site-defaults"

export const TERMINAL_ANIMATIONS = [
  { frames: ["|", "/", "-", "\\"] },
  { frames: [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"] },
  { frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] },
  { frames: ["( ● )", "(  ●)", "(   ●)", "(    )", "(●   )", "( ●  )"] },
  { frames: ["◢", "◣", "◤", "◥"] },
  { frames: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]", "[    ]"] },
  { frames: ["* . .", ". * .", ". . *", ". * ."] },
  { frames: ["<o>", "(o)", " o ", "   "] },
  { frames: ["▖", "▗", "▘", "▝", "▞", "▟", "▙", "▛"] },
  { frames: ["╔═╗", "║ ║", "╚═╝", "   "] },
  { frames: ["·", "•", "●", "◉", "●", "•", "·", " "] },
  { frames: ["∙∙∙", "●∙∙", "∙●∙", "∙∙●", "∙∙∙"] },
  { frames: ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"] },
  { frames: ["⟨ ⟩", "⟨·⟩", "⟨●⟩", "⟨·⟩", "⟨ ⟩"] },
  { frames: ["≡", "≢", "≣", "≡", " "] },
  { frames: ["○", "◌", "◍", "◎", "●", "◎", "◍", "◌"] },
  { frames: ["┌─┐", "│ │", "└─┘"] },
  { frames: ["···", "━━━", "───", "···"] },
  { frames: ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"] },
  { frames: ["∅", "∈", "∉", "∋", "∞", "∝", "∂", "∆"] },
  { frames: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ"] },
  { frames: ["⌛", "⌚", "⊕", "⊗", "⊙", "⊚"] },
  { frames: ["◇", "◆", "◈", "◇"] },
  { frames: ["✦", "✧", "⋆", "·", "⋆", "✧", "✦"] },
  { frames: ["{  }", "{ ·}", "{··}", "{···}", "{··}", "{ ·}", "{  }"] },
  { frames: ["0", "1", "0", "0", "1", "1", "0", "1"] },
]

// ── Terminal Pops background ──
// Fleeting procedural ASCII animation snippets that appear and fade out.
// Carmack optimization: in-place array compaction eliminates per-frame allocations.
export function drawTerminalPops(
  ctx: CanvasRenderingContext2D,
  state: BgState,
  config: SiteConfig
) {
  const p = config.backgrounds.terminal
  const { speed, opacity } = p

  // Spawn new pops
  if (Math.random() < 0.05 && state.pops.length < 50) {
    const anim = TERMINAL_ANIMATIONS[Math.floor(Math.random() * TERMINAL_ANIMATIONS.length)]
    state.pops.push({
      x: Math.random() * state.w,
      y: Math.random() * state.h,
      anim,
      frame: 0,
      life: 1.0,
      opacity: opacity * (0.5 + Math.random() * 0.5),
      color: state.colorCache.palette[Math.floor(Math.random() * state.colorCache.palette.length)] || state.colorCache.secondary
    })
  }

  // Update and Draw
  ctx.font = `14px 'IBM Plex Mono', monospace`
  ctx.textAlign = "center"

  let writeIdx = 0
  const pops = state.pops
  for (let i = 0; i < pops.length; i++) {
    const pop = pops[i]
    pop.life -= 0.005 * (speed / 0.08)
    pop.frame = Math.floor((1 - pop.life) * 20) % pop.anim.frames.length

    if (pop.life > 0) {
      const alpha = pop.life > 0.8 ? (1 - pop.life) * 5 : pop.life * 1.25
      ctx.globalAlpha = Math.min(pop.opacity, alpha) * state.readerAlpha
      ctx.fillStyle = pop.color
      ctx.fillText(pop.anim.frames[pop.frame], pop.x, pop.y)
      pops[writeIdx++] = pop
    }
  }
  pops.length = writeIdx
  ctx.globalAlpha = 1
}
