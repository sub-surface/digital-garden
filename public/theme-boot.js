// Applies the reader's saved theme and accent BEFORE first paint.
// The store (src/store/index.ts) does the same once JS boots, but by then the
// Worker's prerendered page has already painted in the defaults: light-theme
// readers saw a dark flash, and accents changed colour on load. Same-origin
// file rather than inline script because the CSP is script-src 'self'.
// Mirrors applyTheme / applyTriadicPalette; keep the three in step.
;(function () {
  try {
    var saved = JSON.parse(localStorage.getItem("garden-settings") || "null")
    var state = (saved && saved.state) || {}
    var root = document.documentElement
    if (state.theme === "light" || state.theme === "dark") root.setAttribute("data-theme", state.theme)
    var hex = state.accentBase
    if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0, d = max - min
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      h *= 60
    }
    function hsl(hh) {
      var a = s * Math.min(l, 1 - l)
      function f(n) {
        var k = (n + hh / 30) % 12
        var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
        return Math.round(v * 255).toString(16).padStart(2, "0")
      }
      return "#" + f(0) + f(8) + f(4)
    }
    root.style.setProperty("--color-accent-base", hex)
    root.style.setProperty("--color-secondary", hsl((h + 120) % 360))
    root.style.setProperty("--color-tertiary", hsl((h + 240) % 360))
  } catch (e) {
    // Storage blocked or malformed: the defaults are fine.
  }
})()
