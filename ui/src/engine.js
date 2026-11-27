/**
 * kohaku-skin DOM runtime engine.
 * Applies active skin tokens, rewritten CSS, and the background image layer,
 * and guarantees complete DOM cleanup when disabled or disposed.
 */

import { watch } from "vue"

import { createFxCanvasController } from "./IntroFxCanvas.js"
import {
  buildApiBase,
  clampNumber,
  escapeCssUrl,
  resolveBackgroundUrl,
  resolveLiveWallpaperSource,
  rewriteRelativeCssUrls,
  sanitizeCssIdentifier,
} from "./utils.js"

export const STYLE_ELEMENT_ID = "kohaku-skin-active-css"
export const BG_ROOT_ID = "kohaku-skin-bg-root"

const ALLOWED_TOKEN_NAME = /^--ks-[a-z0-9-]+$/i

/**
 * Ensure the background root DOM tree exists at the start of document.body.
 */
function ensureBgRoot(doc) {
  let root = doc.getElementById(BG_ROOT_ID)
  if (root) return root

  root = doc.createElement("div")
  root.id = BG_ROOT_ID
  root.setAttribute("aria-hidden", "true")

  const imageEl = doc.createElement("div")
  imageEl.className = "ks-bg-image"
  const dimmerEl = doc.createElement("div")
  dimmerEl.className = "ks-bg-dimmer"

  root.appendChild(imageEl)
  root.appendChild(dimmerEl)

  if (doc.body) {
    if (doc.body.firstChild) {
      doc.body.insertBefore(root, doc.body.firstChild)
    } else {
      doc.body.appendChild(root)
    }
  }
  return root
}

/**
 * Remove the background root DOM tree if present.
 */
function removeBgRoot(doc) {
  const existing = doc.getElementById(BG_ROOT_ID)
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing)
  }
}

/**
 * Ensure the active skin <style> element exists inside document.head and set its CSS text.
 */
function upsertActiveStyle(doc, cssText) {
  let styleEl = doc.getElementById(STYLE_ELEMENT_ID)
  if (!styleEl) {
    styleEl = doc.createElement("style")
    styleEl.id = STYLE_ELEMENT_ID
    styleEl.setAttribute("data-kohaku-skin", "active")
    if (doc.head) {
      doc.head.appendChild(styleEl)
    }
  }
  if (styleEl.textContent !== cssText) {
    styleEl.textContent = cssText
  }
  return styleEl
}

/**
 * Remove the active skin <style> element if present.
 */
function removeActiveStyle(doc) {
  const existing = doc.getElementById(STYLE_ELEMENT_ID)
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing)
  }
}

/**
 * Create an isolated skin runtime engine bound to a package name.
 */
export function createSkinEngine(pkgName) {
  const appliedTokenKeys = new Set()
  let liveFxController = null
  let liveVideoUrl = ""
  let liveFxPreset = ""

  function teardownLiveMedia(doc) {
    if (liveFxController) {
      liveFxController.dispose()
      liveFxController = null
    }
    liveVideoUrl = ""
    liveFxPreset = ""
    if (!doc) return
    const bgRoot = doc.getElementById(BG_ROOT_ID)
    if (!bgRoot) return
    const existingVideo =
      typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-video") : null
    if (existingVideo) {
      try {
        if (typeof existingVideo.pause === "function") existingVideo.pause()
        existingVideo.src = ""
      } catch (_err) {
        // Ignore video cleanup errors.
      }
      if (existingVideo.parentNode) {
        existingVideo.parentNode.removeChild(existingVideo)
      }
    }
    const existingCanvas =
      typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-fx-canvas") : null
    if (existingCanvas && existingCanvas.parentNode) {
      existingCanvas.parentNode.removeChild(existingCanvas)
    }
  }

  function syncLiveMedia(doc, liveSource) {
    const bgRoot = ensureBgRoot(doc)
    const dimmerEl =
      typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-dimmer") : null

    if (liveSource.kind === "video") {
      let videoEl =
        typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-video") : null
      if (!videoEl) {
        videoEl = doc.createElement("video")
        videoEl.className = "ks-bg-video"
        videoEl.muted = true
        videoEl.loop = true
        videoEl.autoplay = true
        videoEl.setAttribute("muted", "")
        videoEl.setAttribute("loop", "")
        videoEl.setAttribute("playsinline", "")
        if (dimmerEl && dimmerEl.parentNode === bgRoot) {
          bgRoot.insertBefore(videoEl, dimmerEl)
        } else {
          bgRoot.appendChild(videoEl)
        }
      }
      if (liveVideoUrl !== liveSource.url) {
        liveVideoUrl = liveSource.url
        videoEl.src = liveSource.url
        if (typeof videoEl.play === "function") {
          const p = videoEl.play()
          if (p && typeof p.catch === "function") p.catch(() => {})
        }
      }
    } else {
      const existingVideo =
        typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-video") : null
      if (existingVideo) {
        try {
          if (typeof existingVideo.pause === "function") existingVideo.pause()
          existingVideo.src = ""
        } catch (_err) {
          // Ignore pause errors.
        }
        if (existingVideo.parentNode) {
          existingVideo.parentNode.removeChild(existingVideo)
        }
      }
      liveVideoUrl = ""
    }

    if (liveSource.fxPreset === "minimal-clean") {
      if (liveFxController) {
        liveFxController.dispose()
        liveFxController = null
      }
      liveFxPreset = "minimal-clean"
      const oldCanvas =
        typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-fx-canvas") : null
      if (oldCanvas && oldCanvas.parentNode) {
        oldCanvas.parentNode.removeChild(oldCanvas)
      }
      return
    }

    let canvasEl =
      typeof bgRoot.querySelector === "function" ? bgRoot.querySelector(".ks-bg-fx-canvas") : null
    if (!canvasEl) {
      canvasEl = doc.createElement("canvas")
      canvasEl.className = "ks-bg-fx-canvas"
      canvasEl.setAttribute("aria-hidden", "true")
      if (dimmerEl && dimmerEl.parentNode === bgRoot) {
        bgRoot.insertBefore(canvasEl, dimmerEl)
      } else {
        bgRoot.appendChild(canvasEl)
      }
    }

    if (!liveFxController) {
      liveFxPreset = liveSource.fxPreset
      liveFxController = createFxCanvasController(canvasEl, {
        preset: liveSource.fxPreset,
        mode: "ambient",
        bursts: [],
        doc,
        win: typeof window !== "undefined" ? window : null,
      })
      liveFxController.start()
    } else if (liveFxPreset !== liveSource.fxPreset) {
      liveFxPreset = liveSource.fxPreset
      liveFxController.setPreset(liveSource.fxPreset)
    }
  }

  function clearInlineTokens(rootEl) {
    for (const key of appliedTokenKeys) {
      rootEl.style.removeProperty(key)
    }
    appliedTokenKeys.clear()
  }

  function setTrackedProperty(rootEl, key, value) {
    rootEl.style.setProperty(key, value)
    appliedTokenKeys.add(key)
  }

  function clearAll(doc) {
    if (!doc || !doc.documentElement) return
    teardownLiveMedia(doc)
    const rootEl = doc.documentElement
    rootEl.removeAttribute("data-ks-active")
    rootEl.removeAttribute("data-ks-skin")
    rootEl.removeAttribute("data-ks-bg-active")
    rootEl.removeAttribute("data-ks-plate")
    clearInlineTokens(rootEl)
    removeActiveStyle(doc)
    removeBgRoot(doc)
  }

  function applyOwnerState(ownerState, hostInfoValue, doc) {
    if (!doc || !doc.documentElement) return
    if (!ownerState || typeof ownerState !== "object") {
      clearAll(doc)
      return
    }

    const rootEl = doc.documentElement
    const prefs = ownerState.preferences && typeof ownerState.preferences === "object"
      ? ownerState.preferences
      : null
    if (!prefs) {
      clearAll(doc)
      return
    }

    clearInlineTokens(rootEl)

    const apiBase = buildApiBase(hostInfoValue, pkgName)
    const payload = ownerState.active_skin_payload
    const skinActive =
      prefs.skin_enabled === true &&
      payload !== null &&
      typeof payload === "object" &&
      typeof payload.id === "string" &&
      payload.id.trim().length > 0

    if (skinActive) {
      const safeId = sanitizeCssIdentifier(payload.id)
      rootEl.setAttribute("data-ks-active", "true")
      rootEl.setAttribute("data-ks-skin", safeId)

      if (payload.tokens && typeof payload.tokens === "object") {
        for (const [tokenKey, tokenVal] of Object.entries(payload.tokens)) {
          if (
            ALLOWED_TOKEN_NAME.test(tokenKey) &&
            (typeof tokenVal === "string" || typeof tokenVal === "number")
          ) {
            const trimmed = String(tokenVal).trim()
            if (trimmed) {
              setTrackedProperty(rootEl, tokenKey, trimmed)
            }
          }
        }
      }

      const rawCss = typeof payload.css_text === "string" ? payload.css_text : ""
      const rewrittenCss = rewriteRelativeCssUrls(rawCss, apiBase, payload.id)
      if (rewrittenCss.trim().length > 0) {
        upsertActiveStyle(doc, rewrittenCss)
      } else {
        removeActiveStyle(doc)
      }
    } else {
      rootEl.removeAttribute("data-ks-active")
      rootEl.removeAttribute("data-ks-skin")
      removeActiveStyle(doc)
    }

    const liveSource = resolveLiveWallpaperSource(ownerState, apiBase)
    const staticBgUrl = liveSource ? "" : resolveBackgroundUrl(ownerState, apiBase)
    if (liveSource || staticBgUrl) {
      const bg = prefs.background && typeof prefs.background === "object" ? prefs.background : {}
      const fit = bg.fit === "contain" ? "contain" : "cover"
      const dim = clampNumber(bg.dim, 0, 0.85, 0.24)
      const blur = Math.round(clampNumber(bg.blur, 0, 32, 14))
      const surfaceAlpha = clampNumber(bg.surface_alpha, 0.2, 1.0, 0.76)
      const readability = clampNumber(bg.readability_scrim, 0, 1, 0.55)

      rootEl.setAttribute("data-ks-bg-active", "true")
      if (liveSource && liveSource.kind === "video") {
        setTrackedProperty(rootEl, "--ks-bg-image", "none")
      } else {
        const imgUrl = liveSource ? liveSource.url : staticBgUrl
        setTrackedProperty(rootEl, "--ks-bg-image", `url("${escapeCssUrl(imgUrl)}")`)
      }
      setTrackedProperty(rootEl, "--ks-bg-fit", fit)
      setTrackedProperty(rootEl, "--ks-bg-dim", String(dim))
      setTrackedProperty(rootEl, "--ks-backdrop-blur", `${blur}px`)
      setTrackedProperty(rootEl, "--ks-surface-alpha", String(surfaceAlpha))
      setTrackedProperty(rootEl, "--ks-readability", String(readability))
      if (readability > 0.02) {
        rootEl.setAttribute("data-ks-plate", "true")
      } else {
        rootEl.removeAttribute("data-ks-plate")
      }
      if (liveSource) {
        syncLiveMedia(doc, liveSource)
      } else {
        teardownLiveMedia(doc)
        ensureBgRoot(doc)
      }
    } else {
      teardownLiveMedia(doc)
      rootEl.removeAttribute("data-ks-bg-active")
      rootEl.removeAttribute("data-ks-plate")
      removeBgRoot(doc)
    }
  }

  /**
   * Apply transient slider values directly to CSS variables while dragging
   * before the debounced RPC commits to the backend owner.
   */
  function previewBackgroundVars(partial, doc) {
    if (!doc || !doc.documentElement) return
    const rootEl = doc.documentElement
    if (rootEl.getAttribute("data-ks-bg-active") !== "true") return
    if (partial.dim !== undefined) {
      setTrackedProperty(rootEl, "--ks-bg-dim", String(clampNumber(partial.dim, 0, 0.85, 0.24)))
    }
    if (partial.blur !== undefined) {
      setTrackedProperty(
        rootEl,
        "--ks-backdrop-blur",
        `${Math.round(clampNumber(partial.blur, 0, 32, 14))}px`,
      )
    }
    if (partial.surface_alpha !== undefined) {
      setTrackedProperty(
        rootEl,
        "--ks-surface-alpha",
        String(clampNumber(partial.surface_alpha, 0.2, 1.0, 0.76)),
      )
    }
    if (partial.readability_scrim !== undefined) {
      const readability = clampNumber(partial.readability_scrim, 0, 1, 0.55)
      setTrackedProperty(rootEl, "--ks-readability", String(readability))
      if (readability > 0.02) {
        rootEl.setAttribute("data-ks-plate", "true")
      } else {
        rootEl.removeAttribute("data-ks-plate")
      }
    }
  }

  return {
    applyOwnerState,
    previewBackgroundVars,
    clearAll,
    getAppliedTokenKeys: () => new Set(appliedTokenKeys),
  }
}

/**
 * Subscribe a reactive owner state ref and host ref to the skin engine.
 * Returns the Vue watch stop handle.
 */
export function bindOwnerToEngine(engine, owner, hostRef, doc) {
  return watch(
    [owner.state, hostRef],
    ([stateVal, hostVal]) => {
      if (stateVal !== null && stateVal !== undefined) {
        engine.applyOwnerState(stateVal, hostVal, doc)
      }
    },
    { immediate: true },
  )
}
