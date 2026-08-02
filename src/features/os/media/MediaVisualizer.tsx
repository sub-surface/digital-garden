import { lazy, Suspense, useEffect, useRef } from "react"
import styles from "../OS.module.scss"
import {
  MEDIA_SKINS,
  isWebGLVizMode,
  type MediaSkin,
  type MediaVizMode,
} from "./mediaTheme"

const MediaWebGLVisualizer = lazy(() => import("./MediaWebGLVisualizer"))

interface Props {
  analyser: AnalyserNode | null
  mode: MediaVizMode
  skin: MediaSkin
  large?: boolean
}

function Canvas2DVisualizer({ analyser, mode, skin, large }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const palette = MEDIA_SKINS[skin]

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context || isWebGLVizMode(mode)) return

    const frequency = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    const waveform = analyser ? new Uint8Array(analyser.fftSize) : null
    const peaks = new Float32Array(64)
    const edges = new Uint16Array(65)
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    let width = 1
    let height = 1
    let dpr = 1
    let bars = 32
    let frame = 0
    let running = false
    let pageVisible = document.visibilityState === "visible"
    let elementVisible = true
    let previousFrame = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      dpr = Math.min(2, window.devicePixelRatio || 1)
      const pixelWidth = Math.max(1, Math.round(width * dpr))
      const pixelHeight = Math.max(1, Math.round(height * dpr))
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      bars = Math.max(20, Math.min(64, Math.floor(width / 7)))
      const maxBin = Math.max(2, (analyser?.frequencyBinCount ?? 2) - 1)
      for (let index = 0; index <= bars; index++) {
        edges[index] = Math.min(maxBin, Math.floor(Math.exp(Math.log(maxBin) * index / bars)))
      }
      peaks.fill(0)
    }

    const drawGrid = (fade = false) => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.fillStyle = fade ? `${palette.background}33` : palette.background
      context.fillRect(0, 0, width, height)
      context.strokeStyle = `${palette.accent}20`
      context.lineWidth = 1
      for (let x = 0; x < width; x += 20) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
      }
      for (let y = 0; y < height; y += 16) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke()
      }
    }

    const bandLevel = (index: number) => {
      if (!frequency) return 0
      const start = edges[index]
      const end = Math.max(start + 1, edges[index + 1])
      let total = 0
      for (let bin = start; bin < end; bin++) total += frequency[bin]
      return total / (end - start) / 255
    }

    const draw = (now: number) => {
      if (!running) return
      frame = requestAnimationFrame(draw)
      const interval = reducedMotion ? 120 : 1000 / 30
      if (now - previousFrame < interval) return
      previousFrame = now

      if (!analyser || !frequency || !waveform) {
        drawGrid()
        context.fillStyle = `${palette.accent}88`
        context.textAlign = "center"
        context.font = "10px monospace"
        context.fillText("AUDIO ANALYSER STANDBY", width / 2, height / 2 + 3)
        return
      }

      if (mode === "scope") {
        analyser.getByteTimeDomainData(waveform)
        drawGrid(true)
        context.beginPath()
        for (let index = 0; index < waveform.length; index++) {
          const x = index / (waveform.length - 1) * width
          const y = waveform[index] / 255 * height
          if (index === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.strokeStyle = palette.bright
        context.shadowColor = palette.accent
        context.shadowBlur = 5
        context.lineWidth = 1.25
        context.stroke()
        context.shadowBlur = 0
        return
      }

      analyser.getByteFrequencyData(frequency)
      if (mode === "waterfall") {
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.drawImage(canvas, 0, -Math.max(1, Math.round(2 * dpr)))
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        const stripHeight = 2
        for (let index = 0; index < bars; index++) {
          const level = bandLevel(index)
          context.fillStyle = level > .72 ? palette.hot : level > .38 ? palette.accent : palette.dim
          context.fillRect(index / bars * width, height - stripHeight, width / bars + .5, stripHeight)
        }
        return
      }

      drawGrid()
      if (mode === "radial") {
        const centerX = width / 2
        const centerY = height / 2
        const radius = Math.min(width, height) * .16
        context.lineWidth = Math.max(1, width / bars - 1)
        for (let index = 0; index < bars; index++) {
          const angle = index / bars * Math.PI * 2 - Math.PI / 2
          const level = bandLevel(index)
          const reach = radius + level * Math.min(width, height) * .31
          context.beginPath()
          context.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius)
          context.lineTo(centerX + Math.cos(angle) * reach, centerY + Math.sin(angle) * reach)
          context.strokeStyle = level > .68 ? palette.hot : palette.accent
          context.stroke()
        }
        context.beginPath()
        context.arc(centerX, centerY, radius - 3, 0, Math.PI * 2)
        context.strokeStyle = palette.bright
        context.lineWidth = 1
        context.stroke()
        return
      }

      const barWidth = width / bars
      for (let index = 0; index < bars; index++) {
        const level = bandLevel(index)
        const barHeight = level * (height - 5)
        peaks[index] = Math.max(barHeight, peaks[index] - (reducedMotion ? 4 : 1.5))
        context.fillStyle = level > .72 ? palette.hot : level > .42 ? palette.accent : palette.dim
        context.fillRect(index * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight)
        context.fillStyle = palette.bright
        context.fillRect(index * barWidth, height - peaks[index] - 1, Math.max(1, barWidth - 1), 1)
      }
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
    start()
    return () => {
      stop()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [analyser, mode, palette])

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.mediaVisual} ${large ? styles.mediaVisualLarge : ""}`}
      aria-label={`${mode} visualisation`}
    />
  )
}

export function MediaVisualizer(props: Props) {
  if (isWebGLVizMode(props.mode)) {
    return (
      <Suspense fallback={<div className={`${styles.mediaVisual} ${props.large ? styles.mediaVisualLarge : ""}`}>LOADING VISUAL ENGINE...</div>}>
        <MediaWebGLVisualizer {...props} mode={props.mode} />
      </Suspense>
    )
  }
  return <Canvas2DVisualizer {...props} />
}
