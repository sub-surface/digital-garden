/**
 * Small, headlessly testable pieces of FILAMENT's density renderer.
 *
 * The simulation evolves a continuous mass field. Rendering each particle into
 * its nearest pixel turned that field back into a noisy point sample, so tiny
 * sub-pixel motions appeared as bright pixels blinking on and off. CIC uses the
 * same continuous tent kernel as the particle-mesh force solver: every sample
 * moves smoothly between four pixels and conserves its total weight.
 */

/** Deposit one screen-space sample with a conservative bilinear (CIC) kernel. */
export function depositCic(
  field: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  weight: number,
): void {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = x - x0
  const ty = y - y0
  const wx0 = 1 - tx
  const wy0 = 1 - ty

  if (y0 >= 0 && y0 < height) {
    const row = y0 * width
    if (x0 >= 0 && x0 < width) field[row + x0] += weight * wx0 * wy0
    if (x0 + 1 >= 0 && x0 + 1 < width) field[row + x0 + 1] += weight * tx * wy0
  }
  if (y0 + 1 >= 0 && y0 + 1 < height) {
    const row = (y0 + 1) * width
    if (x0 >= 0 && x0 < width) field[row + x0] += weight * wx0 * ty
    if (x0 + 1 >= 0 && x0 + 1 < width) field[row + x0 + 1] += weight * tx * ty
  }
}

/**
 * Convert a decay authored at 60 Hz into a wall-time coefficient.
 *
 * A fixed per-frame decay makes trails and brightness change with performance:
 * a 20 Hz machine retains three times as much history as a 60 Hz machine. This
 * form gives both machines the same half-life.
 */
export function timedDecay(decayAt60Hz: number, elapsedSeconds: number): number {
  if (!(decayAt60Hz > 0) || !(elapsedSeconds > 0)) return 0
  return Math.pow(Math.min(1, decayAt60Hz), elapsedSeconds * 60)
}

/**
 * Bilinearly resize a screen-space accumulation field while conserving energy.
 *
 * Adaptive resolution is allowed to change the internal raster, but it should
 * not erase the trail history or flash the exposure meter. Scaling by the old
 * to new pixel-area ratio preserves the field's total weight.
 */
export function resampleConservative(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Float32Array<ArrayBuffer> {
  const target = new Float32Array(targetWidth * targetHeight)
  if (
    source.length === 0 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return target
  }

  const amplitude = (sourceWidth * sourceHeight) / (targetWidth * targetHeight)
  const sx = sourceWidth / targetWidth
  const sy = sourceHeight / targetHeight

  for (let y = 0; y < targetHeight; y++) {
    const gy = (y + 0.5) * sy - 0.5
    const iy = Math.floor(gy)
    const ty = gy - iy
    const y0 = Math.max(0, Math.min(sourceHeight - 1, iy))
    const y1 = Math.max(0, Math.min(sourceHeight - 1, iy + 1))
    const row0 = y0 * sourceWidth
    const row1 = y1 * sourceWidth
    const outRow = y * targetWidth
    for (let x = 0; x < targetWidth; x++) {
      const gx = (x + 0.5) * sx - 0.5
      const ix = Math.floor(gx)
      const tx = gx - ix
      const x0 = Math.max(0, Math.min(sourceWidth - 1, ix))
      const x1 = Math.max(0, Math.min(sourceWidth - 1, ix + 1))
      const a = source[row0 + x0] + (source[row0 + x1] - source[row0 + x0]) * tx
      const b = source[row1 + x0] + (source[row1 + x1] - source[row1 + x0]) * tx
      target[outRow + x] = (a + (b - a) * ty) * amplitude
    }
  }
  return target
}
