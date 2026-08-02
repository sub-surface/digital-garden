import { useEffect, useRef, useState } from "react"
import styles from "../OS.module.scss"
import { MEDIA_SKINS, type MediaPalette, type MediaSkin } from "./mediaTheme"

const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FEEDBACK_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uPrevious;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform int uMode;
uniform vec3 uAccent;
uniform vec3 uBright;
uniform vec3 uHot;
in vec2 vUv;
out vec4 outColor;

mat2 rotate2d(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / max(1.0, uResolution.y);
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float drift = 0.003 + uBass * 0.018 + sin(uTime * 0.23) * 0.002;
  vec2 historyUv = rotate2d(drift) * (uv - 0.5) * (0.994 - uBass * 0.006) + 0.5;
  vec3 history = texture(uPrevious, historyUv).rgb * (0.956 + uTreble * 0.018);

  float pulse;
  vec3 injection;
  if (uMode == 0) {
    float petals = sin(angle * (6.0 + floor(uMid * 5.0)) + uTime * 0.7) * 0.5 + 0.5;
    float ring = exp(-70.0 * abs(radius - (0.16 + uBass * 0.24 + petals * 0.035)));
    float thread = exp(-130.0 * abs(sin(angle * 3.0 + radius * 20.0 - uTime) * 0.035 + radius - 0.28));
    pulse = ring * (0.35 + uBass) + thread * (0.1 + uTreble * 0.7);
    injection = mix(uAccent, uHot, petals) * pulse;
  } else {
    float corridor = abs(sin(log(radius + 0.025) * 12.0 - uTime * (1.2 + uBass * 2.0)));
    float spokes = pow(abs(cos(angle * 8.0 + uTime * 0.35)), 20.0);
    float horizon = exp(-18.0 * radius) * (0.3 + uBass);
    pulse = smoothstep(0.82, 1.0, corridor) * (0.25 + uMid) + spokes * uTreble + horizon;
    injection = mix(uAccent, uBright, clamp(radius * 1.7, 0.0, 1.0)) * pulse;
  }
  vec3 color = max(history, injection) + history * 0.025;
  color *= 1.0 - smoothstep(0.15, 0.76, radius);
  outColor = vec4(color, 1.0);
}`

const COPY_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uTexture, vUv); }
`

interface Props {
  analyser: AnalyserNode | null
  mode: "feedback" | "tunnel"
  skin: MediaSkin
  large?: boolean
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("Unable to create shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compile failed"
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function program(gl: WebGL2RenderingContext, fragment: string) {
  const value = gl.createProgram()
  if (!value) throw new Error("Unable to create program")
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const pixel = compile(gl, gl.FRAGMENT_SHADER, fragment)
  gl.attachShader(value, vertex)
  gl.attachShader(value, pixel)
  gl.linkProgram(value)
  gl.deleteShader(vertex)
  gl.deleteShader(pixel)
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value) || "Program link failed")
  return value
}

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function setColor(gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, color: string) {
  const [red, green, blue] = rgb(color)
  gl.uniform3f(location, red, green, blue)
}

function makeTarget(gl: WebGL2RenderingContext, width: number, height: number) {
  const texture = gl.createTexture()
  const framebuffer = gl.createFramebuffer()
  if (!texture || !framebuffer) throw new Error("Unable to create feedback target")
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  return { texture, framebuffer }
}

function energy(data: Uint8Array, start: number, end: number) {
  let sum = 0
  for (let index = start; index < end; index++) sum += data[index]
  return sum / Math.max(1, end - start) / 255
}

export default function MediaWebGLVisualizer({ analyser, mode, skin, large }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setError(null)
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" })
    if (!gl) {
      setError("WEBGL2 UNAVAILABLE")
      return
    }

    let feedbackProgram: WebGLProgram
    let copyProgram: WebGLProgram
    try {
      feedbackProgram = program(gl, FEEDBACK_SHADER)
      copyProgram = program(gl, COPY_SHADER)
    } catch (cause) {
      if (import.meta.env.DEV) console.error("[media visualizer] shader failed:", cause)
      setError("WEBGL SHADER FAILED")
      return
    }

    const palette: MediaPalette = MEDIA_SKINS[skin]
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const uniforms = {
      previous: gl.getUniformLocation(feedbackProgram, "uPrevious"),
      resolution: gl.getUniformLocation(feedbackProgram, "uResolution"),
      time: gl.getUniformLocation(feedbackProgram, "uTime"),
      bass: gl.getUniformLocation(feedbackProgram, "uBass"),
      mid: gl.getUniformLocation(feedbackProgram, "uMid"),
      treble: gl.getUniformLocation(feedbackProgram, "uTreble"),
      mode: gl.getUniformLocation(feedbackProgram, "uMode"),
      accent: gl.getUniformLocation(feedbackProgram, "uAccent"),
      bright: gl.getUniformLocation(feedbackProgram, "uBright"),
      hot: gl.getUniformLocation(feedbackProgram, "uHot"),
      texture: gl.getUniformLocation(copyProgram, "uTexture"),
    }
    let targets: ReturnType<typeof makeTarget>[] = []
    let readIndex = 0
    let width = 1
    let height = 1
    let frame = 0
    let running = false
    let pageVisible = document.visibilityState === "visible"
    let elementVisible = true
    let previousFrame = 0
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    const destroyTargets = () => {
      for (const target of targets) {
        gl.deleteFramebuffer(target.framebuffer)
        gl.deleteTexture(target.texture)
      }
      targets = []
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      width = Math.max(1, Math.round(rect.width * dpr))
      height = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width === width && canvas.height === height && targets.length) return
      canvas.width = width
      canvas.height = height
      destroyTargets()
      targets = [makeTarget(gl, width, height), makeTarget(gl, width, height)]
      readIndex = 0
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    const draw = (now: number) => {
      if (!running) return
      frame = requestAnimationFrame(draw)
      const interval = reducedMotion ? 120 : 1000 / 30
      if (now - previousFrame < interval || targets.length < 2) return
      previousFrame = now
      if (analyser && bins) analyser.getByteFrequencyData(bins)
      const bass = bins ? energy(bins, 1, Math.min(18, bins.length)) : 0.08
      const mid = bins ? energy(bins, Math.min(18, bins.length), Math.min(100, bins.length)) : 0.05
      const treble = bins ? energy(bins, Math.min(100, bins.length), Math.min(260, bins.length)) : 0.03
      const writeIndex = readIndex === 0 ? 1 : 0

      gl.viewport(0, 0, width, height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIndex].framebuffer)
      gl.useProgram(feedbackProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, targets[readIndex].texture)
      gl.uniform1i(uniforms.previous, 0)
      gl.uniform2f(uniforms.resolution, width, height)
      gl.uniform1f(uniforms.time, now / 1_000)
      gl.uniform1f(uniforms.bass, bass)
      gl.uniform1f(uniforms.mid, mid)
      gl.uniform1f(uniforms.treble, treble)
      gl.uniform1i(uniforms.mode, mode === "feedback" ? 0 : 1)
      setColor(gl, uniforms.accent, palette.accent)
      setColor(gl, uniforms.bright, palette.bright)
      setColor(gl, uniforms.hot, palette.hot)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(copyProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, targets[writeIndex].texture)
      gl.uniform1i(uniforms.texture, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      readIndex = writeIndex
    }

    const start = () => {
      if (running || !pageVisible || !elementVisible) return
      running = true
      frame = requestAnimationFrame(draw)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }
    const onVisibility = () => {
      pageVisible = document.visibilityState === "visible"
      if (pageVisible) start()
      else stop()
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      stop()
      setError("WEBGL CONTEXT LOST")
    }

    resize()
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
    resizeObserver?.observe(canvas)
    const intersectionObserver = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
        elementVisible = entry.isIntersecting
        if (elementVisible) start()
        else stop()
      })
    intersectionObserver?.observe(canvas)
    document.addEventListener("visibilitychange", onVisibility)
    canvas.addEventListener("webglcontextlost", onContextLost)
    start()
    return () => {
      stop()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      destroyTargets()
      gl.deleteVertexArray(vao)
      gl.deleteProgram(feedbackProgram)
      gl.deleteProgram(copyProgram)
    }
  }, [analyser, mode, skin])

  return (
    <div className={`${styles.mediaWebGL} ${large ? styles.mediaVisualLarge : ""}`}>
      <canvas ref={canvasRef} className={styles.mediaVisual} aria-label={`${mode} WebGL visualisation`} />
      {error && <span>{error}</span>}
    </div>
  )
}
