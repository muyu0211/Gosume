/**
 * Paper size specs — the single source of truth for pagination + export sizing.
 * Mirrors `pkg/export/paper.go`. Values use the CSS reference pixel (96dpi) so
 * `1in = 96px` and `1mm = 96/25.4 px`, matching how the headless renderer lays
 * out `mm`-based CSS and how Chromium reports PDF paper size in inches.
 */

export type PaperSizeName = 'A4' | 'Letter'
export type Orientation = 'portrait' | 'landscape'

export interface PaperSpec {
  name: PaperSizeName
  /** Portrait dimensions in millimetres (landscape swaps them). */
  mmW: number
  mmH: number
  /** Dimensions in CSS pixels (96dpi). */
  pxW: number
  pxH: number
  /** Dimensions in inches (for headless print APIs). */
  inchW: number
  inchH: number
}

/** CSS reference DPI: 1in = 96px. */
export const MM_TO_PX = 96 / 25.4

const BASE: Record<PaperSizeName, { mmW: number; mmH: number }> = {
  A4: { mmW: 210, mmH: 297 },
  Letter: { mmW: 215.9, mmH: 279.4 },
}

export const DEFAULT_PAPER_SIZE: PaperSizeName = 'A4'
export const DEFAULT_ORIENTATION: Orientation = 'portrait'

/** Normalizes an arbitrary paper-size string to a known spec (fallback A4). */
export function normalizePaperSize(value: string | null | undefined): PaperSizeName {
  if (value === 'Letter' || value === 'letter') return 'Letter'
  return 'A4'
}

function isLandscape(orientation: string | null | undefined): boolean {
  return orientation === 'landscape'
}

/** Resolves a full spec from a paper-size name and orientation. */
export function resolvePaper(
  size?: string | null,
  orientation?: string | null,
): PaperSpec {
  const name = normalizePaperSize(size)
  const base = BASE[name]
  const landscape = isLandscape(orientation)
  const mmW = landscape ? base.mmH : base.mmW
  const mmH = landscape ? base.mmW : base.mmH
  return {
    name,
    mmW,
    mmH,
    pxW: Math.round(mmW * MM_TO_PX),
    pxH: Math.round(mmH * MM_TO_PX),
    inchW: round2(mmW / 25.4),
    inchH: round2(mmH / 25.4),
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Default A4-portrait spec. */
export const DEFAULT_PAPER: PaperSpec = resolvePaper()

/**
 * A4-portrait shortcuts kept for existing call sites (e.g. the preview panel's
 * chrome width). Prefer {@link resolvePaper} for anything template-dependent.
 */
export const A4_W = DEFAULT_PAPER.pxW
export const A4_H = DEFAULT_PAPER.pxH
