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
