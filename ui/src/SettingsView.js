/**
 * Settings section component ("preferences") for kohaku-skin.
 * Uses KT SDK SettingsGroup, SettingsRow, and ActionButton controls.
 */

import { computed, onUnmounted, ref, watch } from "vue"
import {
  ActionButton,
  SettingsGroup,
  SettingsRow,
  confirm,
  notify,
  useExtension,
  useHost,
  useLocale,
  useOwner,
} from "@kohakuterrarium/ui-sdk"

import { bindOwnerToEngine } from "./engine.js"
import {
  buildApiBase,
  buildTemplateZipUrl,
  clampNumber,
  detectSkinImportFormat,
  extractErrorMessage,
  isAllowedCustomUrl,
  readFileAsBase64,
} from "./utils.js"

/**
 * Create the SettingsView Vue component bound to a skin engine instance.
 */
export function createSettingsView(engine) {
  return {
    name: "KohakuSkinSettingsView",
    components: {
      ActionButton,
      SettingsGroup,
      SettingsRow,
    },
    setup() {
      const kt = useExtension()
      const owner = useOwner()
      const host = useHost()
      const locale = useLocale()

      const stopEngineWatch = bindOwnerToEngine(
        engine,
        owner,
        host,
        typeof document !== "undefined" ? document : null,
      )

      const busy = ref(false)
      const skinFileInput = ref(null)
      const bgFileInput = ref(null)
      const customUrlDraft = ref("")

      const alphaDraft = ref(0.76)
      const blurDraft = ref(14)
      const dimDraft = ref(0.24)
      let sliderCommitTimer = null

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
      const bgFit = computed(() => (bg.value && bg.value.fit === "contain" ? "contain" : "cover"))
      const uploadedFile = computed(() =>
        bg.value && typeof bg.value.uploaded_file === "string" ? bg.value.uploaded_file : "",
      )
      const hasCustomWallpaper = computed(
        () => Boolean(uploadedFile.value) || Boolean(bg.value && bg.value.custom_url),
      )
      const customDirHint = computed(() =>
        ownerState.value && typeof ownerState.value.custom_skins_rel_hint === "string"
          ? ownerState.value.custom_skins_rel_hint
          : "kohaku-skin/skins",
      )
      const wallpaperStatus = computed(() => {
        if (uploadedFile.value) {
          return tr("skin.wallpaperUploaded", { name: uploadedFile.value })
        }
        if (bg.value && bg.value.custom_url) {
          return String(bg.value.custom_url)
        }
        return tr("skin.wallpaperNone", {})
      })

      watch(
        bg,
        (nextBg) => {
          if (!nextBg) return
          customUrlDraft.value = typeof nextBg.custom_url === "string" ? nextBg.custom_url : ""
          alphaDraft.value = clampNumber(nextBg.surface_alpha, 0.2, 1.0, 0.76)
          blurDraft.value = Math.round(clampNumber(nextBg.blur, 0, 32, 14))
          dimDraft.value = clampNumber(nextBg.dim, 0, 0.85, 0.24)
        },
        { immediate: true },
      )

      onUnmounted(() => {
        stopEngineWatch()
        if (sliderCommitTimer !== null) {
          clearTimeout(sliderCommitTimer)
          sliderCommitTimer = null
        }
      })

      async function runAction(actionName, payload) {
        busy.value = true
        try {
          const updated = await owner.call(actionName, payload)
          if (updated && typeof updated === "object" && typeof document !== "undefined") {
            engine.applyOwnerState(updated, host.value, document)
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

      async function selectDefaultSkin() {
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

      async function rescanSkins() {
        try {
          const updated = await runAction("rescan_skins", {})
          const count = updated && Array.isArray(updated.skins) ? updated.skins.length : skins.value.length
          notify(tr("skin.toastRescanned", { count }), "success")
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

      function downloadStarterTemplate() {
        const apiBase = buildApiBase(host.value, kt.package)
        const url = buildTemplateZipUrl(apiBase)
        if (typeof document === "undefined") return
        const link = document.createElement("a")
        link.href = url
        link.download = "kohaku-skin-template.zip"
        link.rel = "noopener"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      async function deleteCustomSkin(skin) {
        const ok = await confirm(
          tr("skin.confirmDelete", { name: skin.name || skin.id }),
          tr("skin.confirmDeleteTitle", {}),
          {},
        )
        if (!ok) return
        try {
          await runAction("delete_custom_skin", { skin_id: skin.id })
          notify(tr("skin.toastDeleted", { name: skin.name || skin.id }), "success")
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      async function setBackgroundMode(mode) {
        try {
          await runAction("set_background", { mode })
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      async function setBackgroundFit(fit) {
        try {
          await runAction("set_background", { fit })
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

      async function applyCustomUrl() {
        const raw = customUrlDraft.value.trim()
        if (!raw) {
          notify(tr("skin.toastUrlEmpty", {}), "warning")
          return
        }
        if (!isAllowedCustomUrl(raw)) {
          notify(
            tr("skin.toastActionFailed", { message: "URL must start with https:// or http://" }),
            "warning",
          )
          return
        }
        try {
          if (uploadedFile.value) {
            await runAction("clear_wallpaper", {})
          }
          await runAction("set_background", { mode: "custom", custom_url: raw })
          notify(tr("skin.toastUrlApplied", {}), "success")
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      async function clearWallpaper() {
        try {
          await runAction("clear_wallpaper", {})
          customUrlDraft.value = ""
          notify(tr("skin.toastWallpaperCleared", {}), "success")
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function scheduleSliderCommit(partial) {
        if (typeof document !== "undefined") {
          engine.previewBackgroundVars(partial, document)
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

      function onDimInput(ev) {
        const val = clampNumber(ev.target.value, 0, 0.85, 0.24)
        dimDraft.value = val
        scheduleSliderCommit({ dim: val })
      }

      return {
        owner,
        busy,
        skinFileInput,
        bgFileInput,
        customUrlDraft,
        alphaDraft,
        blurDraft,
        dimDraft,
        ownerState,
        skins,
        skinEnabled,
        activeSkinId,
        bgMode,
        bgFit,
        hasCustomWallpaper,
        customDirHint,
        wallpaperStatus,
        tr,
        selectDefaultSkin,
        selectSkin,
        rescanSkins,
        triggerSkinImport,
        onSkinFileChange,
        downloadStarterTemplate,
        deleteCustomSkin,
        setBackgroundMode,
        setBackgroundFit,
        triggerBgUpload,
        onBgFileChange,
        applyCustomUrl,
        clearWallpaper,
        onAlphaInput,
        onBlurInput,
        onDimInput,
      }
    },
    template: `
      <div class="ks-settings" data-test="ks-settings-root">
        <div v-if="!ownerState && owner.status.value === 'loading'" class="ks-settings-banner">
          {{ tr("skin.loading", {}) }}
        </div>
        <div v-else-if="!ownerState" class="ks-settings-banner">
          {{ tr("skin.ownerUnavailable", { status: owner.status.value || "unknown" }) }}
        </div>

        <template v-else>
          <input
            ref="skinFileInput"
            class="ks-settings-hidden-input"
            type="file"
            accept=".zip,.css"
            data-test="ks-skin-file-input"
            @change="onSkinFileChange"
          />
          <input
            ref="bgFileInput"
            class="ks-settings-hidden-input"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif,.svg"
            data-test="ks-bg-file-input"
            @change="onBgFileChange"
          />

          <SettingsGroup
            :title="tr('skin.groupSkinsTitle', {})"
            :description="tr('skin.groupSkinsDesc', {})"
          >
            <template #action>
              <div class="ks-settings-toolbar">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  data-test="ks-btn-rescan"
                  @click="rescanSkins"
                >
                  {{ tr("skin.btnRescan", {}) }}
                </ActionButton>
                <ActionButton
                  variant="primary"
                  size="sm"
                  :disabled="busy"
                  data-test="ks-btn-import"
                  @click="triggerSkinImport"
                >
                  {{ tr("skin.btnImport", {}) }}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  data-test="ks-btn-template"
                  @click="downloadStarterTemplate"
                >
                  {{ tr("skin.btnTemplate", {}) }}
                </ActionButton>
              </div>
            </template>

            <div class="ks-settings-skin-grid">
              <div
                class="ks-settings-skin-card"
                :class="{ 'ks-settings-skin-card--active': !skinEnabled }"
                data-test="ks-skin-default"
              >
                <div class="ks-settings-skin-head">
                  <div>
                    <div class="ks-settings-skin-title">{{ tr("skin.defaultName", {}) }}</div>
                    <div class="ks-settings-skin-meta">KohakuTerrarium</div>
                  </div>
                  <div class="ks-settings-badges">
                    <span class="ks-settings-badge">{{ tr("skin.badgeStock", {}) }}</span>
                    <span v-if="!skinEnabled" class="ks-settings-badge ks-settings-badge--active">
                      {{ tr("skin.badgeActive", {}) }}
                    </span>
                  </div>
                </div>
                <p class="ks-settings-skin-desc">{{ tr("skin.defaultDesc", {}) }}</p>
                <div class="ks-settings-card-actions">
                  <ActionButton
                    :variant="!skinEnabled ? 'secondary' : 'primary'"
                    size="sm"
                    :disabled="busy || !skinEnabled"
                    data-test="ks-activate-default"
                    @click="selectDefaultSkin"
                  >
                    {{ !skinEnabled ? tr("skin.btnActive", {}) : tr("skin.btnActivate", {}) }}
                  </ActionButton>
                </div>
              </div>

              <div
                v-for="skin in skins"
                :key="skin.id"
                class="ks-settings-skin-card"
                :class="{ 'ks-settings-skin-card--active': skinEnabled && activeSkinId === skin.id }"
                :data-test="'ks-skin-card-' + skin.id"
              >
                <div class="ks-settings-skin-head">
                  <div>
                    <div class="ks-settings-skin-title">{{ skin.name || skin.id }}</div>
                    <div class="ks-settings-skin-meta">
                      {{ skin.author || "Community" }} / v{{ skin.version || "1.0.0" }}
                    </div>
                  </div>
                  <div class="ks-settings-badges">
                    <span
                      class="ks-settings-badge"
                      :class="{ 'ks-settings-badge--custom': skin.source === 'custom' }"
                    >
                      {{ skin.source === "custom" ? tr("skin.badgeCustom", {}) : tr("skin.badgeBuiltin", {}) }}
                    </span>
                    <span
                      v-if="skinEnabled && activeSkinId === skin.id"
                      class="ks-settings-badge ks-settings-badge--active"
                    >
                      {{ tr("skin.badgeActive", {}) }}
                    </span>
                  </div>
                </div>

                <p class="ks-settings-skin-desc">{{ skin.description || skin.id }}</p>

                <div class="ks-settings-card-actions">
                  <ActionButton
                    :variant="skinEnabled && activeSkinId === skin.id ? 'secondary' : 'primary'"
                    size="sm"
                    :disabled="busy || (skinEnabled && activeSkinId === skin.id)"
                    :data-test="'ks-activate-' + skin.id"
                    @click="selectSkin(skin.id)"
                  >
                    {{ skinEnabled && activeSkinId === skin.id ? tr("skin.btnActive", {}) : tr("skin.btnActivate", {}) }}
                  </ActionButton>

                  <ActionButton
                    v-if="skin.source === 'custom'"
                    variant="danger"
                    size="sm"
                    :disabled="busy"
                    :data-test="'ks-delete-' + skin.id"
                    @click="deleteCustomSkin(skin)"
                  >
                    {{ tr("skin.btnDelete", {}) }}
                  </ActionButton>
                </div>
              </div>
            </div>

            <div class="ks-settings-dir-hint">
              {{ tr("skin.customDirHint", { path: customDirHint }) }}
            </div>
          </SettingsGroup>

          <SettingsGroup
            :title="tr('skin.groupBgTitle', {})"
            :description="tr('skin.groupBgDesc', {})"
          >
            <SettingsRow
              :title="tr('skin.rowModeTitle', {})"
              :hint="tr('skin.rowModeHint', {})"
            >
              <div class="ks-settings-segmented">
                <button
                  type="button"
                  class="ks-settings-seg-btn"
                  :class="{ 'ks-settings-seg-btn--active': bgMode === 'off' }"
                  :disabled="busy"
                  data-test="ks-bg-mode-off"
                  @click="setBackgroundMode('off')"
                >
                  {{ tr("skin.modeOff", {}) }}
                </button>
                <button
                  type="button"
                  class="ks-settings-seg-btn"
                  :class="{ 'ks-settings-seg-btn--active': bgMode === 'skin' }"
                  :disabled="busy"
                  data-test="ks-bg-mode-skin"
                  @click="setBackgroundMode('skin')"
                >
                  {{ tr("skin.modeSkin", {}) }}
                </button>
                <button
                  type="button"
                  class="ks-settings-seg-btn"
                  :class="{ 'ks-settings-seg-btn--active': bgMode === 'custom' }"
                  :disabled="busy"
                  data-test="ks-bg-mode-custom"
                  @click="setBackgroundMode('custom')"
                >
                  {{ tr("skin.modeCustom", {}) }}
                </button>
              </div>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.rowWallpaperTitle', {})"
              :hint="tr('skin.rowWallpaperHint', {})"
              :status="wallpaperStatus"
              :tone="hasCustomWallpaper ? 'ok' : 'muted'"
            >
              <div class="ks-settings-toolbar">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  data-test="ks-btn-upload-bg"
                  @click="triggerBgUpload"
                >
                  {{ tr("skin.btnUploadBg", {}) }}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  :disabled="busy || !hasCustomWallpaper"
                  data-test="ks-btn-clear-bg"
                  @click="clearWallpaper"
                >
                  {{ tr("skin.btnClearBg", {}) }}
                </ActionButton>
              </div>
              <template #detail>
                <div class="ks-settings-url-row">
                  <input
                    v-model="customUrlDraft"
                    class="ks-settings-input"
                    type="url"
                    :placeholder="tr('skin.wallpaperUrlPlaceholder', {})"
                    data-test="ks-bg-url-input"
                    @keyup.enter="applyCustomUrl"
                  />
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    :disabled="busy"
                    data-test="ks-btn-apply-url"
                    @click="applyCustomUrl"
                  >
                    {{ tr("skin.btnApplyUrl", {}) }}
                  </ActionButton>
                </div>
              </template>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.rowFitTitle', {})"
              :hint="tr('skin.rowFitHint', {})"
            >
              <div class="ks-settings-segmented">
                <button
                  type="button"
                  class="ks-settings-seg-btn"
                  :class="{ 'ks-settings-seg-btn--active': bgFit === 'cover' }"
                  :disabled="busy"
                  data-test="ks-bg-fit-cover"
                  @click="setBackgroundFit('cover')"
                >
                  {{ tr("skin.fitCover", {}) }}
                </button>
                <button
                  type="button"
                  class="ks-settings-seg-btn"
                  :class="{ 'ks-settings-seg-btn--active': bgFit === 'contain' }"
                  :disabled="busy"
                  data-test="ks-bg-fit-contain"
                  @click="setBackgroundFit('contain')"
                >
                  {{ tr("skin.fitContain", {}) }}
                </button>
              </div>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.rowAlphaTitle', {})"
              :hint="tr('skin.rowAlphaHint', {})"
            >
              <div class="ks-settings-slider-wrap">
                <input
                  class="ks-settings-slider"
                  type="range"
                  min="0.20"
                  max="1.00"
                  step="0.02"
                  :value="alphaDraft"
                  data-test="ks-slider-alpha"
                  @input="onAlphaInput"
                />
                <span class="ks-settings-slider-val">{{ Math.round(alphaDraft * 100) }}%</span>
              </div>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.rowBlurTitle', {})"
              :hint="tr('skin.rowBlurHint', {})"
            >
              <div class="ks-settings-slider-wrap">
                <input
                  class="ks-settings-slider"
                  type="range"
                  min="0"
                  max="32"
                  step="1"
                  :value="blurDraft"
                  data-test="ks-slider-blur"
                  @input="onBlurInput"
                />
                <span class="ks-settings-slider-val">{{ blurDraft }}px</span>
              </div>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.rowDimTitle', {})"
              :hint="tr('skin.rowDimHint', {})"
            >
              <div class="ks-settings-slider-wrap">
                <input
                  class="ks-settings-slider"
                  type="range"
                  min="0"
                  max="0.85"
                  step="0.02"
                  :value="dimDraft"
                  data-test="ks-slider-dim"
                  @input="onDimInput"
                />
                <span class="ks-settings-slider-val">{{ Math.round(dimDraft * 100) }}%</span>
              </div>
            </SettingsRow>
          </SettingsGroup>
        </template>
      </div>
    `,
  }
}
