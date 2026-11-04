/**
 * Shared wavenumber binning for FILAMENT's power spectra.
 *
 * Wavenumbers are integers: k counts how many whole wavelengths of a mode fit
 * across the periodic box, so k = 1 is the box itself (180 Mpc) and k = 64 is
 * the Nyquist limit of a 128² mesh (2.8 Mpc). The initial conditions record
 * their linear spectrum in these bins and the live measurement reads the mesh
 * into the same bins, which is what makes the two directly comparable.
 */

/** Number of logarithmic bins. */
export const K_BINS = 22
const K_LO = 0.75
const K_HI = 136
const LOG_LO = Math.log(K_LO)
const LOG_STEP = (Math.log(K_HI) - LOG_LO) / K_BINS

/** Bin index for integer wavenumber magnitude `k`, or -1 outside the range. */
export function kBin(k: number): number {
  if (!(k >= K_LO) || k >= K_HI) return -1
  return Math.floor((Math.log(k) - LOG_LO) / LOG_STEP)
}

/** Geometric centre of bin `i`. */
export function kBinCentre(i: number): number {
  return Math.exp(LOG_LO + (i + 0.5) * LOG_STEP)
}

/** sin(x)/x, finite at zero. */
export function sinc(x: number): number {
  return Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x
}

/**
 * Power-spectrum window of a bilinear (cloud-in-cell) assignment on an n-cell
 * mesh, for integer mode (kx, ky): the square of the kernel's Fourier transform,
 * W² = [sinc(πkx/n)·sinc(πky/n)]⁴.
 */
export function cicWindow2(kx: number, ky: number, n: number): number {
  const w = sinc((Math.PI * kx) / n) * sinc((Math.PI * ky) / n)
  const w2 = w * w
  return w2 * w2
}
