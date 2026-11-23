/**
 * Native Session Floating Dock integration ("v2-dock") and skin popover for kohaku-skin.
 * Injects a standalone icon-only button into [data-test="v2-dock"] > .kt-v2-float
 * outside Vue's v-if fragment anchors, and teleports a pure-text popover above the dock.
 */

import { Teleport, computed, onMounted, onUnmounted, ref, watch } from "vue"
import {
  notify,
  openTab,
  useExtension,
  useHost,
  useLocale,
  useOwner,
} from "@kohakuterrarium/ui-sdk"

import { bindOwnerToEngine } from "./engine.js"
import {
  clampNumber,
  detectSkinImportFormat,
  extractErrorMessage,
  readFileAsBase64,
} from "./utils.js"

const SVG_NS = "http://www.w3.org/2000/svg"
const OWNS_ESC_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [role='dialog'], .el-overlay, .el-popper"

/**
 * Create a reactive panel control shared between the stage component, command handler, and dispose hook.
 */
export function createDockPanelControl() {
  const open = ref(false)
  const cleanups = new Set()
  let onToggleHook = null

  function setToggleHook(fn) {
    onToggleHook = fn
  }

  function toggle() {
    if (typeof onToggleHook === "function") {
      onToggleHook()
      return
    }
    open.value = !open.value
  }

  function close() {
    open.value = false
  }

  function registerCleanup(fn) {
    cleanups.add(fn)
    return () => {
      cleanups.delete(fn)
    }
  }

  function dispose() {
    open.value = false
    onToggleHook = null
    for (const fn of cleanups) {
      fn()
    }
    cleanups.clear()
  }

  return {
    open,
    setToggleHook,
    toggle,
    close,
    registerCleanup,
    dispose,
  }
}

/**
 * Create an SVG element with safe namespace handling across browsers and minimal DOM mocks.
 */
function createSvgNode(doc, tagName) {
  if (typeof doc.createElementNS === "function") {
    return doc.createElementNS(SVG_NS, tagName)
  }
  return doc.createElement(tagName)
}

/**
 * Build the bespoke standalone vector icon (faceted Kohaku prism) for the dock button.
 */
function buildDockIconSvg(doc) {
  const svg = createSvgNode(doc, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "15")
  svg.setAttribute("height", "15")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "1.7")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")

  const paths = [
    "M12 2.5L20.5 9.5L12 21.5L3.5 9.5L12 2.5Z",
    "M3.5 9.5H20.5",
    "M12 2.5L8.5 9.5L12 21.5L15.5 9.5L12 2.5Z",
  ]
  for (const d of paths) {
    const pathEl = createSvgNode(doc, "path")
    pathEl.setAttribute("d", d)
    svg.appendChild(pathEl)
  }
  return svg
}

/**
 * Return direct child pill bar (.kt-v2-float excluding v2-dock-more-menu) of a v2-dock root.
 */
function findDockPillBar(dockEl) {
  if (!dockEl || !dockEl.children) return null
  for (const child of dockEl.children) {
    const className = typeof child.className === "string" ? child.className : ""
    const hasFloat =
      (child.classList && child.classList.contains("kt-v2-float")) ||
      className.split(/\s+/).includes("kt-v2-float")
    const dataTest = typeof child.getAttribute === "function" ? child.getAttribute("data-test") : null
    if (hasFloat && dataTest !== "v2-dock-more-menu") {
      return child
    }
  }
  return null
}

/**
 * Check whether an element has a non-empty layout presence.
 */
function isElementVisible(el) {
  if (!el) return false
  if (el.offsetParent !== undefined && el.offsetParent !== null) return true
  if (typeof el.getClientRects === "function") {
    return el.getClientRects().length > 0
  }
  return true
}

/**
 * Find the currently visible [data-test="v2-dock"] element, preferring a clicked dock.
 */
export function findVisibleDock(doc, preferredDock) {
  if (!doc) return null
  if (preferredDock && preferredDock.isConnected !== false && isElementVisible(preferredDock)) {
    return preferredDock
  }
  if (typeof doc.querySelectorAll !== "function") return null
  const docks = doc.querySelectorAll('[data-test="v2-dock"]')
  for (const dock of docks) {
    if (isElementVisible(dock)) return dock
  }
  return docks.length > 0 ? docks[0] : null
}

/**
 * Compute fixed viewport coordinates anchoring the popover directly above the visible v2-dock.
 */
export function computePopoverStyle(doc, win, preferredDock) {
  const fallback = {
    position: "fixed",
    zIndex: "2450",
    right: "16px",
    bottom: "96px",
  }
  if (!doc || !win) return fallback
  const dockEl = findVisibleDock(doc, preferredDock)
  if (!dockEl || typeof dockEl.getBoundingClientRect !== "function") return fallback
  const rect = dockEl.getBoundingClientRect()
  if (!rect || (rect.width === 0 && rect.height === 0)) return fallback

  const rightPx = Math.max(12, Math.round(win.innerWidth - rect.right))
  const bottomPx = Math.max(16, Math.round(win.innerHeight - rect.top + 8))
  return {
    position: "fixed",
    zIndex: "2450",
    right: `${rightPx}px`,
    bottom: `${bottomPx}px`,
  }
}

/**
 * Inject standalone icon-only skin buttons into all [data-test="v2-dock"] pill bars
 * before pillBar.firstChild so Vue 3 fragment anchors are untouched.
 */
export function syncDockButtons(doc, options) {
  if (!doc || typeof doc.querySelectorAll !== "function") return []
  const docks = doc.querySelectorAll('[data-test="v2-dock"]')
  const buttons = []

  for (const dockEl of docks) {
    const pillBar = findDockPillBar(dockEl)
    if (!pillBar) continue

    let slotEl = null
    for (const child of pillBar.children || []) {
      const dt = typeof child.getAttribute === "function" ? child.getAttribute("data-test") : null
      if (dt === "ks-dock-slot") {
        slotEl = child
        break
      }
    }

    let btnEl = null
    if (!slotEl) {
      slotEl = doc.createElement("span")
      slotEl.className = "ks-dock-slot"
      slotEl.setAttribute("data-test", "ks-dock-slot")

      btnEl = doc.createElement("button")
      btnEl.type = "button"
      btnEl.className = "ks-dock-icon-btn"
      btnEl.setAttribute("data-test", "ks-dock-btn")
      btnEl.appendChild(buildDockIconSvg(doc))

      const handleClick = (ev) => {
        if (ev && typeof ev.stopPropagation === "function") {
          ev.stopPropagation()
        }
        options.onToggle(dockEl)
      }
      if (typeof btnEl.addEventListener === "function") {
        btnEl.addEventListener("click", handleClick)
      }
      slotEl.appendChild(btnEl)

      if (pillBar.firstChild) {
        pillBar.insertBefore(slotEl, pillBar.firstChild)
      } else {
        pillBar.appendChild(slotEl)
      }
    } else {
      btnEl =
        typeof slotEl.querySelector === "function"
          ? slotEl.querySelector('[data-test="ks-dock-btn"]')
          : (slotEl.children && slotEl.children[0]) || null
    }

    if (btnEl) {
      btnEl.className = options.active ? "ks-dock-icon-btn ks-dock-icon-btn--active" : "ks-dock-icon-btn"
      btnEl.setAttribute("title", options.title)
      btnEl.setAttribute("aria-label", options.title)
      btnEl.setAttribute("aria-expanded", options.open ? "true" : "false")
      buttons.push(btnEl)
    }
  }

  return buttons
}

/**
 * Remove all injected .ks-dock-slot elements from the document.
 */
export function removeInjectedDockButtons(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return
  const slots = doc.querySelectorAll('[data-test="ks-dock-slot"]')
  for (const slot of slots) {
    if (slot.parentNode) {
      slot.parentNode.removeChild(slot)
    }
  }
}

/**
 * Create the stage & dock skin popover component bound to the skin engine and panel control.
 */
export function createDockSkinPanel(engine, panelControl) {
  return {
    name: "KohakuSkinDockPanel",
    components: {
      Teleport,
    },
    setup() {
      const kt = useExtension()
      const owner = useOwner()
      const host = useHost()
      const locale = useLocale()

      const docRef = typeof document !== "undefined" ? document : null
      const winRef = typeof window !== "undefined" ? window : null

      const stopEngineWatch = bindOwnerToEngine(engine, owner, host, docRef)

      const open = panelControl.open
      const busy = ref(false)
      const skinFileInput = ref(null)
      const bgFileInput = ref(null)
      const popoverEl = ref(null)
      const alphaDraft = ref(0.76)
      const blurDraft = ref(14)
      const popoverStyle = ref(computePopoverStyle(docRef, winRef, null))

      let activeDockEl = null
      let sliderCommitTimer = null
      let mutationObserver = null
      let pendingRafId = null
      let listenersBound = false

      function tr(key, params) {
        void locale.value
        return kt.t(key, params)
      }

      const ownerState = computed(() => owner.state.value)
      const prefs = computed(() => (ownerState.value && ownerState.value.preferences) || null)
      const bg = computed(() => (prefs.value && prefs.value.background) || null)
      const skins = computed(() =>
        ownerState.value && Array.isArray(ownerState.value.skins) ? ownerState.value.skins : [],
      )
      const skinEnabled = computed(() => Boolean(prefs.value && prefs.value.skin_enabled === true))
      const activeSkinId = computed(() => (prefs.value ? prefs.value.active_skin_id : null))
      const bgMode = computed(() => (bg.value && typeof bg.value.mode === "string" ? bg.value.mode : "off"))
      const hasCustomWallpaper = computed(
        () => Boolean(bg.value && (bg.value.uploaded_file || bg.value.custom_url)),
      )

      function refreshPopoverPosition() {
        popoverStyle.value = computePopoverStyle(docRef, winRef, activeDockEl)
      }

      function toggleFromDock(dockEl) {
        if (dockEl) {
          activeDockEl = dockEl
        }
        if (!open.value) {
          refreshPopoverPosition()
          open.value = true
        } else {
          open.value = false
        }
      }

      panelControl.setToggleHook(() => {
        toggleFromDock(activeDockEl)
      })

      function syncAllDocks() {
        if (!docRef) return
        syncDockButtons(docRef, {
          active: Boolean(open.value || skinEnabled.value),
          open: Boolean(open.value),
          title: tr("skin.floatTitle", {}),
          onToggle: toggleFromDock,
        })
      }

      function scheduleDockSync() {
        if (pendingRafId !== null) return
        if (winRef && typeof winRef.requestAnimationFrame === "function") {
          pendingRafId = winRef.requestAnimationFrame(() => {
            pendingRafId = null
            syncAllDocks()
          })
        } else {
          syncAllDocks()
        }
      }

      function onDocumentKeydown(ev) {
        if (!open.value || ev.key !== "Escape") return
        const target = ev.target
        if (target && typeof target.closest === "function" && target.closest(OWNS_ESC_SELECTOR)) {
          return
        }
        ev.preventDefault()
        open.value = false
      }

      function onDocumentPointerDown(ev) {
        if (!open.value) return
        const target = ev.target
        if (!target) return
        if (popoverEl.value && typeof popoverEl.value.contains === "function" && popoverEl.value.contains(target)) {
          return
        }
        if (typeof target.closest === "function" && target.closest('[data-test="ks-dock-slot"]')) {
          return
        }
        if (target === skinFileInput.value || target === bgFileInput.value) {
          return
        }
        open.value = false
      }

      function onWindowResize() {
        if (open.value) {
          refreshPopoverPosition()
        }
      }

      function teardownDomIntegration() {
        if (pendingRafId !== null && winRef && typeof winRef.cancelAnimationFrame === "function") {
          winRef.cancelAnimationFrame(pendingRafId)
          pendingRafId = null
        }
        if (mutationObserver !== null) {
          mutationObserver.disconnect()
          mutationObserver = null
        }
        if (listenersBound) {
          if (winRef && typeof winRef.removeEventListener === "function") {
            winRef.removeEventListener("keydown", onDocumentKeydown, true)
            winRef.removeEventListener("resize", onWindowResize)
          }
          if (docRef && typeof docRef.removeEventListener === "function") {
            docRef.removeEventListener("pointerdown", onDocumentPointerDown, true)
          }
          listenersBound = false
        }
        if (sliderCommitTimer !== null) {
          clearTimeout(sliderCommitTimer)
          sliderCommitTimer = null
        }
        removeInjectedDockButtons(docRef)
      }

      const unregisterControlCleanup = panelControl.registerCleanup(teardownDomIntegration)

      function startDomIntegration() {
        if (!docRef) return
        syncAllDocks()
        if (!mutationObserver && typeof MutationObserver !== "undefined" && docRef.body) {
          mutationObserver = new MutationObserver(() => {
            scheduleDockSync()
          })
          mutationObserver.observe(docRef.body, { childList: true, subtree: true })
        }
        if (!listenersBound) {
          if (winRef && typeof winRef.addEventListener === "function") {
            winRef.addEventListener("keydown", onDocumentKeydown, true)
            winRef.addEventListener("resize", onWindowResize)
          }
          if (docRef && typeof docRef.addEventListener === "function") {
            docRef.addEventListener("pointerdown", onDocumentPointerDown, true)
          }
          listenersBound = true
        }
      }

      onMounted(() => {
        startDomIntegration()
      })

      watch(
        [open, skinEnabled, locale],
        () => {
          syncAllDocks()
          if (open.value) {
            refreshPopoverPosition()
          }
        },
        { immediate: false },
      )

      watch(
        bg,
        (nextBg) => {
          if (!nextBg) return
          alphaDraft.value = clampNumber(nextBg.surface_alpha, 0.2, 1.0, 0.76)
          blurDraft.value = Math.round(clampNumber(nextBg.blur, 0, 32, 14))
        },
        { immediate: true },
      )

      onUnmounted(() => {
        stopEngineWatch()
        unregisterControlCleanup()
        teardownDomIntegration()
      })

      function closePanel() {
        open.value = false
      }

      function openFullSettings() {
        open.value = false
        openTab({
          kind: "settings",
          id: "settings",
          section: `ext:${kt.package}/preferences`,
        })
      }

      async function runAction(actionName, payload) {
        busy.value = true
        try {
          const updated = await owner.call(actionName, payload)
          if (updated && typeof updated === "object" && docRef) {
            engine.applyOwnerState(updated, host.value, docRef)
          }
          return updated
        } catch (err) {
          const message = extractErrorMessage(err, actionName)
          notify(tr("skin.toastActionFailed", { message }), "error")
          throw err
        } finally {
          busy.value = false
        }
      }

      async function selectDefault() {
        try {
          await runAction("set_skin", { skin_enabled: false, active_skin_id: null })
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      async function selectSkin(skinId) {
        try {
          await runAction("set_skin", { skin_enabled: true, active_skin_id: skinId })
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function triggerSkinImport() {
        if (skinFileInput.value) {
          skinFileInput.value.value = ""
          skinFileInput.value.click()
        }
      }

      async function onSkinFileChange(ev) {
        const input = ev.target
        const file = input && input.files && input.files[0] ? input.files[0] : null
        if (!file) return
        const format = detectSkinImportFormat(file.name)
        if (!format) {
          notify(tr("skin.toastUnsupportedSkinFile", {}), "warning")
          return
        }
        try {
          const encoded = await readFileAsBase64(file)
          const updated = await runAction("install_custom_skin", {
            format,
            filename: encoded.filename,
            content_base64: encoded.base64,
            activate: true,
          })
          const activeName =
            (updated && updated.active_skin_payload && updated.active_skin_payload.name) ||
            encoded.filename
          notify(tr("skin.toastImported", { name: activeName }), "success")
        } catch (err) {
          if (!err || !err.code) {
            notify(
              tr("skin.toastActionFailed", { message: extractErrorMessage(err, file.name) }),
              "error",
            )
          }
        }
      }

      async function setBgMode(mode) {
        try {
          await runAction("set_background", { mode })
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function triggerBgUpload() {
        if (bgFileInput.value) {
          bgFileInput.value.value = ""
          bgFileInput.value.click()
        }
      }

      async function onBgFileChange(ev) {
        const input = ev.target
        const file = input && input.files && input.files[0] ? input.files[0] : null
        if (!file) return
        try {
          const encoded = await readFileAsBase64(file)
          await runAction("upload_wallpaper", {
            filename: encoded.filename,
            content_base64: encoded.base64,
          })
          notify(tr("skin.toastWallpaperUploaded", {}), "success")
        } catch (err) {
          if (!err || !err.code) {
            notify(
              tr("skin.toastActionFailed", { message: extractErrorMessage(err, file.name) }),
              "error",
            )
          }
        }
      }

      async function clearWallpaper() {
        try {
          await runAction("clear_wallpaper", {})
          notify(tr("skin.toastWallpaperCleared", {}), "success")
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function scheduleSliderCommit(partial) {
        if (docRef) {
          engine.previewBackgroundVars(partial, docRef)
        }
        if (sliderCommitTimer !== null) {
          clearTimeout(sliderCommitTimer)
        }
        sliderCommitTimer = setTimeout(() => {
          sliderCommitTimer = null
          runAction("set_background", partial).catch(() => {})
        }, 160)
      }

      function onAlphaInput(ev) {
        const val = clampNumber(ev.target.value, 0.2, 1.0, 0.76)
        alphaDraft.value = val
        scheduleSliderCommit({ surface_alpha: val })
      }

      function onBlurInput(ev) {
        const val = Math.round(clampNumber(ev.target.value, 0, 32, 14))
        blurDraft.value = val
        scheduleSliderCommit({ blur: val })
      }

      return {
        open,
        busy,
        skinFileInput,
        bgFileInput,
        popoverEl,
        alphaDraft,
        blurDraft,
        popoverStyle,
        skins,
        skinEnabled,
        activeSkinId,
        bgMode,
        hasCustomWallpaper,
        tr,
        startDomIntegration,
        teardownDomIntegration,
        closePanel,
        openFullSettings,
        selectDefault,
        selectSkin,
        triggerSkinImport,
        onSkinFileChange,
        setBgMode,
        triggerBgUpload,
        onBgFileChange,
        clearWallpaper,
        onAlphaInput,
        onBlurInput,
      }
    },
    template: `
      <span class="ks-stage-anchor" aria-hidden="true">
        <Teleport to="body">
          <input
            ref="skinFileInput"
            class="ks-settings-hidden-input"
            type="file"
            accept=".zip,.css"
            data-test="ks-dock-skin-input"
            @change="onSkinFileChange"
          />
          <input
            ref="bgFileInput"
            class="ks-settings-hidden-input"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
            data-test="ks-dock-bg-input"
            @change="onBgFileChange"
          />

          <section
            v-if="open"
            ref="popoverEl"
            class="ks-dock-popover kt-v2-float kt-v2-edge"
            :style="popoverStyle"
            data-test="ks-dock-popover"
          >
            <header class="ks-dock-popover-header kt-v2-chrome kt-v2-line">
              <span class="ks-dock-popover-title">{{ tr("skin.floatTitle", {}) }}</span>
              <div class="ks-dock-popover-actions">
                <button
                  type="button"
                  class="ks-dock-text-btn"
                  data-test="ks-dock-open-settings"
                  @click="openFullSettings"
                >
                  {{ tr("skin.btnOpenSettingsShort", {}) }}
                </button>
                <button
                  type="button"
                  class="ks-dock-text-btn"
                  data-test="ks-dock-close"
                  @click="closePanel"
                >
                  {{ tr("skin.btnClose", {}) }}
                </button>
              </div>
            </header>

            <div class="ks-dock-popover-body">
              <div class="ks-dock-section">
                <div class="ks-dock-section-head">
                  <span>{{ tr("skin.floatSkinLabel", {}) }}</span>
                </div>
                <div class="ks-dock-skin-list">
                  <button
                    type="button"
                    class="ks-dock-chip"
                    :class="{ 'ks-dock-chip--active': !skinEnabled }"
                    :disabled="busy"
                    data-test="ks-dock-skin-default"
                    @click="selectDefault"
                  >
                    {{ tr("skin.defaultName", {}) }}
                  </button>
                  <button
                    v-for="skin in skins"
                    :key="skin.id"
                    type="button"
                    class="ks-dock-chip"
                    :class="{ 'ks-dock-chip--active': skinEnabled && activeSkinId === skin.id }"
                    :disabled="busy"
                    :data-test="'ks-dock-skin-' + skin.id"
                    @click="selectSkin(skin.id)"
                  >
                    {{ skin.name || skin.id }}
                  </button>
                </div>
                <div class="ks-dock-btn-row">
                  <button
                    type="button"
                    class="ks-dock-btn"
                    :disabled="busy"
                    data-test="ks-dock-import-btn"
                    @click="triggerSkinImport"
                  >
                    {{ tr("skin.floatQuickImport", {}) }}
                  </button>
                </div>
              </div>

              <div class="ks-dock-section">
                <div class="ks-dock-section-head">
                  <span>{{ tr("skin.floatBgLabel", {}) }}</span>
                </div>
                <div class="ks-dock-mode-row">
                  <button
                    type="button"
                    class="ks-dock-mode-btn"
                    :class="{ 'ks-dock-mode-btn--active': bgMode === 'off' }"
                    :disabled="busy"
                    data-test="ks-dock-bg-off"
                    @click="setBgMode('off')"
                  >
                    {{ tr("skin.modeOff", {}) }}
                  </button>
                  <button
                    type="button"
                    class="ks-dock-mode-btn"
                    :class="{ 'ks-dock-mode-btn--active': bgMode === 'skin' }"
                    :disabled="busy"
                    data-test="ks-dock-bg-skin"
                    @click="setBgMode('skin')"
                  >
                    {{ tr("skin.modeSkin", {}) }}
                  </button>
                  <button
                    type="button"
                    class="ks-dock-mode-btn"
                    :class="{ 'ks-dock-mode-btn--active': bgMode === 'custom' }"
                    :disabled="busy"
                    data-test="ks-dock-bg-custom"
                    @click="setBgMode('custom')"
                  >
                    {{ tr("skin.modeCustom", {}) }}
                  </button>
                </div>

                <div class="ks-dock-btn-row">
                  <button
                    type="button"
                    class="ks-dock-btn"
                    :disabled="busy"
                    data-test="ks-dock-upload-bg"
                    @click="triggerBgUpload"
                  >
                    {{ tr("skin.btnUploadBg", {}) }}
                  </button>
                  <button
                    type="button"
                    class="ks-dock-btn"
                    :disabled="busy || !hasCustomWallpaper"
                    data-test="ks-dock-clear-bg"
                    @click="clearWallpaper"
                  >
                    {{ tr("skin.btnClearBg", {}) }}
                  </button>
                </div>

                <div class="ks-dock-slider-row">
                  <span class="ks-dock-slider-label">{{ tr("skin.floatOpacityLabel", {}) }}</span>
                  <input
                    class="ks-dock-slider-input"
                    type="range"
                    min="0.20"
                    max="1.00"
                    step="0.02"
                    :value="alphaDraft"
                    data-test="ks-dock-slider-alpha"
                    @input="onAlphaInput"
                  />
                  <span class="ks-dock-slider-num">{{ Math.round(alphaDraft * 100) }}%</span>
                </div>

                <div class="ks-dock-slider-row">
                  <span class="ks-dock-slider-label">{{ tr("skin.floatBlurLabel", {}) }}</span>
                  <input
                    class="ks-dock-slider-input"
                    type="range"
                    min="0"
                    max="32"
                    step="1"
                    :value="blurDraft"
                    data-test="ks-dock-slider-blur"
                    @input="onBlurInput"
                  />
                  <span class="ks-dock-slider-num">{{ blurDraft }}px</span>
                </div>
              </div>
            </div>
          </section>
        </Teleport>
      </span>
    `,
  }
}
