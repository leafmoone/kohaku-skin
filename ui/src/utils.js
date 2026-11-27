/**
 * Pure utility functions for kohaku-skin frontend runtime and UI.
 * All helper parameters are declared explicitly with no default values.
 */

const SKIPPED_URL_PATTERN = /^(?:data:|https?:|blob:|\/\/|\/|#|var\()/i
const ALLOWED_CUSTOM_URL_PATTERN = /^https?:\/\//i
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/gi

export const BACKGROUND_PRESETS = Object.freeze({
  clearReading: Object.freeze({
    surface_alpha: 0.82,
    readability_scrim: 0.72,
    blur: 16,
    dim: 0.28,
  }),
  vividArtwork: Object.freeze({
    surface_alpha: 0.56,
    readability_scrim: 0.42,
    blur: 8,
    dim: 0.14,
  }),
})

export const FX_PRESETS = Object.freeze([
  "starlight-cyan",
  "amber-firefly",
  "sakura-petals",
  "cyber-neon",
  "minimal-clean",
])

export const DEFAULT_INTRO_PREFS = Object.freeze({
  enabled: false,
  active_intro_id: "kohaku-starlight",
  play_on_startup: true,
  keep_live_wallpaper: true,
  volume: 0.85,
  muted: false,
})

/**
 * Clamp a numeric value within [min, max], returning fallback for invalid input.
 */
export function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  if (num < min) return min
  if (num > max) return max
  return num
}

/**
 * Normalize a skin identifier for safe use in HTML data attributes.
 */
export function sanitizeCssIdentifier(value) {
  if (typeof value !== "string") return ""
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-")
}

/**
 * Escape quotes and backslashes for safe embedding inside CSS url("...").
 */
export function escapeCssUrl(url) {
  return String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r|\n/g, "")
}

/**
 * Split a relative asset path into safe URL-encoded segments.
 * Rejects path traversal ("..") by returning an empty string.
 */
export function encodePathSegments(relPath) {
  if (typeof relPath !== "string") return ""
  const normalized = relPath.replace(/\\/g, "/").trim()
  if (!normalized) return ""
  const rawParts = normalized.split("/")
  const encodedParts = []
  for (const part of rawParts) {
    if (!part || part === ".") continue
    if (part === "..") return ""
    encodedParts.push(encodeURIComponent(part))
  }
  return encodedParts.join("/")
}

/**
 * Build the base extension API path for the active KT host.
 */
export function buildApiBase(hostInfoValue, pkgName) {
  const encodedPkg = encodeURIComponent(String(pkgName))
  if (hostInfoValue && hostInfoValue.sameOrigin === false && typeof hostInfoValue.url === "string") {
    const origin = hostInfoValue.url.trim().replace(/\/+$/, "")
    if (origin) return `${origin}/api/ext/${encodedPkg}`
  }
  return `/api/ext/${encodedPkg}`
}

/**
 * Build a backend asset URL for a file inside a skin pack.
 * Always routes through /skins/{skin_id}/assets/{asset_path}.
 */
export function buildSkinAssetUrl(apiBase, skinId, rawRelPath) {
  if (typeof rawRelPath !== "string" || typeof skinId !== "string" || !skinId.trim()) return ""
  const trimmed = rawRelPath.trim()
  if (!trimmed) return ""

  const suffixIndex = trimmed.search(/[?#]/)
  const pathOnly = suffixIndex >= 0 ? trimmed.slice(0, suffixIndex) : trimmed
  const suffix = suffixIndex >= 0 ? trimmed.slice(suffixIndex) : ""

  const encoded = encodePathSegments(pathOnly)
  if (!encoded) return ""

  const assetPath = encoded.startsWith("assets/") ? encoded : `assets/${encoded}`
  return `${apiBase}/skins/${encodeURIComponent(skinId)}/${assetPath}${suffix}`
}

/**
 * Build the backend URL for a user-uploaded custom wallpaper file.
 */
export function buildWallpaperUrl(apiBase, filename) {
  if (typeof filename !== "string" || !filename.trim()) return ""
  const cleanName = filename.trim().replace(/^\/+/, "")
  if (!cleanName || cleanName.includes("..") || cleanName.includes("/") || cleanName.includes("\\")) {
    return ""
  }
  return `${apiBase}/wallpapers/${encodeURIComponent(cleanName)}`
}

/**
 * Build the download URL for the starter custom skin template zip.
 */
export function buildTemplateZipUrl(apiBase) {
  return `${apiBase}/template.zip`
}

/**
 * Build a backend asset URL for a file inside an intro pack.
 * Always routes through /intros/{intro_id}/assets/{asset_path}, percent-encoding
 * special filename characters such as "#" instead of treating them as URL fragments.
 */
export function buildIntroAssetUrl(apiBase, introId, rawRelPath) {
  if (typeof rawRelPath !== "string" || typeof introId !== "string" || !introId.trim()) return ""
  const trimmed = rawRelPath.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed) || /^synth:/i.test(trimmed)) return trimmed

  const encoded = encodePathSegments(trimmed)
  if (!encoded) return ""

  const assetPath = encoded.startsWith("assets/") ? encoded : `assets/${encoded}`
  return `${apiBase}/intros/${encodeURIComponent(introId)}/${assetPath}`
}

/**
 * Build the download URL for exporting an installed intro pack as a zip archive.
 */
export function buildIntroExportZipUrl(apiBase, introId) {
  if (typeof introId !== "string" || !introId.trim()) return ""
  return `${apiBase}/intros/${encodeURIComponent(introId.trim())}/export.zip`
}

/**
 * Build the download URL for the starter intro pack template zip.
 */
export function buildIntroTemplateZipUrl(apiBase) {
  return `${apiBase}/intro-template.zip`
}

/**
 * Smooth cubic Hermite interpolation clamped to [0, 1].
 */
export function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = clampNumber((x - edge0) / (edge1 - edge0), 0, 1, 0)
  return t * t * (3 - 2 * t)
}

/**
 * Quintic smootherstep interpolation (zero 1st and 2nd derivatives at endpoints).
 */
export function smootherstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = clampNumber((x - edge0) / (edge1 - edge0), 0, 1, 0)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Normalize intro preferences safely for backward compatibility with older preferences.json.
 */
export function normalizeIntroPrefs(rawIntro) {
  const src = rawIntro && typeof rawIntro === "object" ? rawIntro : {}
  return {
    enabled: typeof src.enabled === "boolean" ? src.enabled : DEFAULT_INTRO_PREFS.enabled,
    active_intro_id:
      typeof src.active_intro_id === "string" && src.active_intro_id.trim()
        ? src.active_intro_id.trim()
        : null,
    play_on_startup:
      typeof src.play_on_startup === "boolean"
        ? src.play_on_startup
        : DEFAULT_INTRO_PREFS.play_on_startup,
    keep_live_wallpaper:
      typeof src.keep_live_wallpaper === "boolean"
        ? src.keep_live_wallpaper
        : DEFAULT_INTRO_PREFS.keep_live_wallpaper,
    volume: clampNumber(src.volume, 0, 1, DEFAULT_INTRO_PREFS.volume),
    muted: typeof src.muted === "boolean" ? src.muted : DEFAULT_INTRO_PREFS.muted,
  }
}

/**
 * Normalize a normalized [x, y] coordinate pair within [0, 1] for focal/secondary points.
 */
export function normalizePointPair(rawPoint, fallbackX, fallbackY) {
  if (Array.isArray(rawPoint) && rawPoint.length >= 2) {
    return [
      clampNumber(rawPoint[0], 0, 1, fallbackX),
      clampNumber(rawPoint[1], 0, 1, fallbackY),
    ]
  }
  return [fallbackX, fallbackY]
}

/**
 * Normalize a motion [x, y] coordinate pair within [-0.5, 1.5] for off-screen layer/burst paths.
 */
export function normalizeMotionPointPair(rawPoint, fallbackX, fallbackY) {
  if (Array.isArray(rawPoint) && rawPoint.length >= 2) {
    return [
      clampNumber(rawPoint[0], -0.5, 1.5, fallbackX),
      clampNumber(rawPoint[1], -0.5, 1.5, fallbackY),
    ]
  }
  return [fallbackX, fallbackY]
}

/**
 * Compute opacity in [0, 1] for an intro director layer at playback timestamp t.
 */
export function computeLayerOpacity(layer, t) {
  if (!layer || typeof layer !== "object") return 0
  const inSec = clampNumber(layer.in_sec, 0, 120, 0)
  const inDur = clampNumber(layer.in_dur, 0, 60, 0)
  const outSec = clampNumber(layer.out_sec, 0, 120, 0)
  const outDur = clampNumber(layer.out_dur, 0, 60, 0)

  if (t < inSec) return 0
  const fadeIn = inDur > 0 ? smoothstep(inSec, inSec + inDur, t) : 1
  let fadeOut = 1
  if (outSec > inSec && outDur > 0 && t >= outSec) {
    fadeOut = 1 - smoothstep(outSec, outSec + outDur, t)
  } else if (outSec > inSec && outDur === 0 && t >= outSec) {
    fadeOut = 0
  }
  return clampNumber(fadeIn * fadeOut, 0, 1, 0)
}

/**
 * Compute active burst parameters (position, intensity, scale, anamorphic) at time t.
 */
export function computeBurstState(burst, t) {
  if (!burst || typeof burst !== "object") return null
  const start = clampNumber(burst.start_sec, 0, 120, 0)
  const end = clampNumber(burst.end_sec, start, 120, start)
  if (end <= start || t < start || t > end) return null
  const p = (t - start) / (end - start)
  const rise = smoothstep(0, 0.28, p)
  const fall = 1 - smoothstep(0.32, 1, p)
  const envelope = rise * fall
  if (envelope <= 0.005) return null
  const fromPt = normalizeMotionPointPair(burst.from_point, 0.5, 0.5)
  const toPt = normalizeMotionPointPair(burst.to_point, fromPt[0], fromPt[1])
  const move = smoothstep(0, 1, p)
  return {
    x: fromPt[0] + (toPt[0] - fromPt[0]) * move,
    y: fromPt[1] + (toPt[1] - fromPt[1]) * move,
    intensity: clampNumber(burst.intensity, 0.1, 3, 1) * envelope,
    scale: clampNumber(burst.scale, 0.2, 4, 1) * (0.65 + 0.55 * rise),
    anamorphic: clampNumber(burst.anamorphic, 0, 3, 1) * envelope,
    progress: p,
  }
}

/**
 * Resolve the currently active subtitle with smooth fade opacity at playback time t.
 */
export function findActiveSubtitle(subtitles, t) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) return null
  for (const sub of subtitles) {
    if (!sub || typeof sub !== "object") continue
    const inSec = clampNumber(sub.in_sec, 0, 120, 0)
    const outSec = clampNumber(sub.out_sec, inSec, 120, inSec)
    if (outSec <= inSec || t < inSec || t > outSec) continue
    const fadeDur = Math.min(0.45, (outSec - inSec) * 0.28)
    const fadeIn = smoothstep(inSec, inSec + fadeDur, t)
    const fadeOut = 1 - smoothstep(outSec - fadeDur, outSec, t)
    const opacity = clampNumber(fadeIn * fadeOut, 0, 1, 0)
    if (opacity > 0.01) {
      return {
        primary: typeof sub.primary === "string" ? sub.primary : "",
        secondary: typeof sub.secondary === "string" ? sub.secondary : "",
        opacity,
      }
    }
  }
  return null
}

/**
 * Resolve the live wallpaper descriptor from ownerState when intro live wallpaper is active.
 * Returns null if intro or keep_live_wallpaper is disabled, falling back to static wallpaper.
 */
export function resolveLiveWallpaperSource(ownerState, apiBase) {
  if (!ownerState || typeof ownerState !== "object") return null
  const prefs = ownerState.preferences
  if (!prefs || typeof prefs !== "object") return null
  const introPrefs = normalizeIntroPrefs(prefs.intro)
  if (!introPrefs.enabled || !introPrefs.keep_live_wallpaper) return null
  const payload = ownerState.active_intro_payload
  if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || !payload.id.trim()) {
    return null
  }
  const fxPreset = FX_PRESETS.includes(payload.fx_preset) ? payload.fx_preset : "starlight-cyan"
  const focalPoint = normalizePointPair(payload.focal_point, 0.5, 0.45)

  if (typeof payload.loop_video === "string" && payload.loop_video.trim()) {
    const url = buildIntroAssetUrl(apiBase, payload.id, payload.loop_video)
    if (url) return { kind: "video", url, fxPreset, focalPoint, introId: payload.id }
  }
  if (payload.mode === "video" && typeof payload.video === "string" && payload.video.trim()) {
    const url = buildIntroAssetUrl(apiBase, payload.id, payload.video)
    if (url) return { kind: "video", url, fxPreset, focalPoint, introId: payload.id }
  }
  if (
    payload.mode === "single" &&
    typeof payload.auto_stages_image === "string" &&
    payload.auto_stages_image.trim()
  ) {
    const url = buildIntroAssetUrl(apiBase, payload.id, payload.auto_stages_image)
    if (url) return { kind: "image", url, fxPreset, focalPoint, introId: payload.id }
  }
  if (payload.mode === "director" && Array.isArray(payload.layers) && payload.layers.length > 0) {
    for (let i = payload.layers.length - 1; i >= 0; i -= 1) {
      const layer = payload.layers[i]
      if (layer && typeof layer.src === "string" && layer.src.trim()) {
        const url = buildIntroAssetUrl(apiBase, payload.id, layer.src)
        if (url) return { kind: "image", url, fxPreset, focalPoint, introId: payload.id }
      }
    }
  }
  return null
}

/**
 * Rewrite relative url(...) references in a skin's CSS text to the package skin asset endpoint.
 */
export function rewriteRelativeCssUrls(cssText, apiBase, skinId) {
  if (typeof cssText !== "string" || !cssText) return ""
  return cssText.replace(CSS_URL_PATTERN, (fullMatch, dq, sq, bare) => {
    const raw = (dq !== undefined ? dq : sq !== undefined ? sq : bare !== undefined ? bare : "").trim()
    if (!raw || SKIPPED_URL_PATTERN.test(raw)) return fullMatch
    const resolved = buildSkinAssetUrl(apiBase, skinId, raw)
    if (!resolved) return fullMatch
    return `url("${escapeCssUrl(resolved)}")`
  })
}

/**
 * Validate whether a user-entered custom background URL has an allowed scheme.
 */
export function isAllowedCustomUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false
  const trimmed = rawUrl.trim()
  if (!trimmed) return false
  return ALLOWED_CUSTOM_URL_PATTERN.test(trimmed)
}

/**
 * Resolve the effective background image URL from owner state, or empty string when inactive.
 */
export function resolveBackgroundUrl(ownerState, apiBase) {
  if (!ownerState || typeof ownerState !== "object") return ""
  const prefs = ownerState.preferences
  if (!prefs || typeof prefs !== "object") return ""
  const bg = prefs.background
  if (!bg || typeof bg !== "object") return ""

  const mode = typeof bg.mode === "string" ? bg.mode : "off"
  if (mode === "off") return ""

  if (mode === "custom") {
    if (typeof bg.uploaded_file === "string" && bg.uploaded_file.trim()) {
      return buildWallpaperUrl(apiBase, bg.uploaded_file)
    }
    if (typeof bg.custom_url === "string" && isAllowedCustomUrl(bg.custom_url)) {
      return bg.custom_url.trim()
    }
    return ""
  }

  if (mode === "skin") {
    const payload = ownerState.active_skin_payload
    if (
      prefs.skin_enabled === true &&
      payload &&
      typeof payload.id === "string" &&
      payload.id.trim() &&
      typeof payload.default_background === "string" &&
      payload.default_background.trim()
    ) {
      return buildSkinAssetUrl(apiBase, payload.id, payload.default_background)
    }
    return ""
  }

  return ""
}

/**
 * Detect custom skin import format ("zip" or "css") from filename, or null if unsupported.
 */
export function detectSkinImportFormat(filename) {
  if (typeof filename !== "string") return null
  const lower = filename.trim().toLowerCase()
  if (lower.endsWith(".zip")) return "zip"
  if (lower.endsWith(".css")) return "css"
  return null
}

/**
 * Read a browser File into a base64 payload without the data URL prefix.
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file selected"))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`))
    }
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const commaIdx = result.indexOf(",")
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result
      if (!base64) {
        reject(new Error(`Selected file is empty: ${file.name}`))
        return
      }
      resolve({ filename: file.name, base64 })
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Extract a clear user-facing error message from an OwnerCallError or HTTP error.
 */
export function extractErrorMessage(err, fallbackText) {
  if (!err) return fallbackText
  if (typeof err === "string" && err.trim()) return err.trim()
  if (err.response && err.response.data && typeof err.response.data.detail === "string") {
    return err.response.data.detail
  }
  if (typeof err.message === "string" && err.message.trim()) return err.message.trim()
  return fallbackText
}
