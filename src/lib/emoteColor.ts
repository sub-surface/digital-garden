// Browser-only utility — do not import from worker.ts
const cache = new Map<string, string>()

export async function getEmoteColor(name: string): Promise<string> {
  if (cache.has(name)) return cache.get(name)!
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = "/emotes/" + name + ".gif"
    img.onload = () => {
      setTimeout(() => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = img.naturalWidth || 32
          canvas.height = img.naturalHeight || 32
          const ctx = canvas.getContext("2d")
          if (!ctx) { resolve("#b4424c"); return }
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          let r = 0, g = 0, b = 0, count = 0
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 128) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count++ }
          }
          if (count === 0) { resolve("#b4424c"); return }
          const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0")
          const color = "#" + toHex(r) + toHex(g) + toHex(b)
          cache.set(name, color)
          resolve(color)
        } catch { resolve("#b4424c") }
      }, 50)
    }
    img.onerror = () => resolve("#b4424c")
  })
}
