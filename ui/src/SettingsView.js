/**
 * Settings section component ("preferences") for kohaku-skin.
 * Uses KT SDK SettingsGroup, SettingsRow, and ActionButton controls.
 */

import { computed, onMounted, onUnmounted, ref, watch } from "vue"
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
  resolveSkinDescription,
  resolveSkinName,
  syncSettingsHostLabels,
  translateSkinText,
} from "./i18n.js"
import { IntroWorkshopModal } from "./IntroWorkshopModal.js"
import {
  BACKGROUND_PRESETS,
  buildApiBase,
  buildIntroExportZipUrl,
  buildIntroTemplateZipUrl,
  buildTemplateZipUrl,
  clampNumber,
  detectSkinImportFormat,
  extractErrorMessage,
  isAllowedCustomUrl,
  normalizeIntroPrefs,
  readFileAsBase64,
} from "./utils.js"

/**
 * Create the SettingsView Vue component bound to a skin engine and intro playback controller.
 */
export function createSettingsView(engine, introControl) {
  return {
    name: "KohakuSkinSettingsView",
    components: {
      ActionButton,
      IntroWorkshopModal,
      SettingsGroup,
      SettingsRow,
    },
    setup() {
      const kt = useExtension()
      const owner = useOwner()
      const host = useHost()
      const locale = useLocale()

      const docRef = typeof document !== "undefined" ? document : null

      const stopEngineWatch = bindOwnerToEngine(
        engine,
        owner,
        host,
        docRef,
      )

      const busy = ref(false)
      const skinFileInput = ref(null)
      const bgFileInput = ref(null)
      const introZipInput = ref(null)
      const workshopOpen = ref(false)
      const customUrlDraft = ref("")

      const alphaDraft = ref(0.76)
      const blurDraft = ref(14)
      const dimDraft = ref(0.24)
      const readabilityDraft = ref(0.55)
      const introVolumeDraft = ref(0.85)
      let sliderCommitTimer = null
      let introVolumeTimer = null

      function tr(key, params) {
        return translateSkinText(locale.value, key, params)
      }

      function skinLabel(skin) {
        return resolveSkinName(locale.value, skin)
      }

      function skinDesc(skin) {
        return resolveSkinDescription(locale.value, skin)
      }

      onMounted(() => {
        syncSettingsHostLabels(docRef, tr("skin.title", {}))
      })

      watch(locale, () => {
        syncSettingsHostLabels(docRef, tr("skin.title", {}))
      })

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
      const intros = computed(() =>
        ownerState.value && Array.isArray(ownerState.value.intros) ? ownerState.value.intros : [],
      )
      const introPrefs = computed(() =>
        normalizeIntroPrefs(prefs.value ? prefs.value.intro : null),
      )
      const activeIntroPayload = computed(
        () => (ownerState.value && ownerState.value.active_intro_payload) || null,
      )
      const customIntrosDirHint = computed(() =>
        ownerState.value && typeof ownerState.value.custom_intros_rel_hint === "string"
          ? ownerState.value.custom_intros_rel_hint
          : "kohaku-skin/intros",
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
          readabilityDraft.value = clampNumber(nextBg.readability_scrim, 0, 1, 0.55)
        },
        { immediate: true },
      )

      watch(
        introPrefs,
        (nextIntro) => {
          introVolumeDraft.value = clampNumber(nextIntro.volume, 0, 1, 0.85)
        },
        { immediate: true },
      )

      onUnmounted(() => {
        stopEngineWatch()
        if (sliderCommitTimer !== null) {
          clearTimeout(sliderCommitTimer)
          sliderCommitTimer = null
        }
        if (introVolumeTimer !== null) {
          clearTimeout(introVolumeTimer)
          introVolumeTimer = null
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
        const displayName = skinLabel(skin)
        const ok = await confirm(
          tr("skin.confirmDelete", { name: displayName }),
          tr("skin.confirmDeleteTitle", {}),
          {},
        )
        if (!ok) return
        try {
          await runAction("delete_custom_skin", { skin_id: skin.id })
          notify(tr("skin.toastDeleted", { name: displayName }), "success")
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
            tr("skin.toastActionFailed", { message: tr("skin.toastInvalidUrlScheme", {}) }),
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

      function onReadabilityInput(ev) {
        const val = clampNumber(ev.target.value, 0, 1, 0.55)
        readabilityDraft.value = val
        scheduleSliderCommit({ readability_scrim: val })
      }

      async function applyPreset(presetKey) {
        const preset = BACKGROUND_PRESETS[presetKey]
        if (!preset) return
        if (sliderCommitTimer !== null) {
          clearTimeout(sliderCommitTimer)
          sliderCommitTimer = null
        }
        alphaDraft.value = preset.surface_alpha
        readabilityDraft.value = preset.readability_scrim
        blurDraft.value = preset.blur
        dimDraft.value = preset.dim
        if (typeof document !== "undefined") {
          engine.previewBackgroundVars(preset, document)
        }
        try {
          await runAction("set_background", { ...preset })
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function introModeLabel(mode) {
        if (mode === "director") return tr("skin.introModeDirector", {})
        if (mode === "video") return tr("skin.introModeVideo", {})
        return tr("skin.introModeSingle", {})
      }

      async function updateIntroPref(partial) {
        try {
          await runAction("set_intro", partial)
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function onIntroVolumeInput(ev) {
        const val = clampNumber(ev.target.value, 0, 1, 0.85)
        introVolumeDraft.value = val
        if (introVolumeTimer !== null) {
          clearTimeout(introVolumeTimer)
        }
        introVolumeTimer = setTimeout(() => {
          introVolumeTimer = null
          runAction("set_intro", { volume: val }).catch(() => {})
        }, 160)
      }

      function previewIntroPack(pack) {
        const target =
          pack ||
          activeIntroPayload.value ||
          intros.value.find((item) => item && item.id === introPrefs.value.active_intro_id) ||
          intros.value[0] ||
          null
        if (!target) {
          notify(tr("skin.introToastNoActive", {}), "warning")
          return
        }
        if (introControl && typeof introControl.requestReplay === "function") {
          introControl.requestReplay(target)
        }
      }

      async function rescanIntros() {
        try {
          const updated = await runAction("rescan_intros", {})
          const count = updated && Array.isArray(updated.intros) ? updated.intros.length : intros.value.length
          notify(tr("skin.introToastRescanned", { count }), "success")
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      function triggerIntroZipImport() {
        if (introZipInput.value) {
          introZipInput.value.value = ""
          introZipInput.value.click()
        }
      }

      async function onIntroZipChange(ev) {
        const input = ev.target
        const file = input && input.files && input.files[0] ? input.files[0] : null
        if (!file) return
        busy.value = true
        try {
          const formData = new FormData()
          formData.append("file", file)
          formData.append("activate", "true")
          let data = null
          if (kt && kt.api && typeof kt.api.post === "function") {
            const resp = await kt.api.post("/intros/import-zip", formData)
            data = resp && resp.data ? resp.data : null
          } else {
            const apiBase = buildApiBase(host.value, kt.package)
            const resp = await fetch(`${apiBase}/intros/import-zip`, {
              method: "POST",
              body: formData,
              credentials: "same-origin",
            })
            if (!resp.ok) {
              throw new Error((await resp.text()) || `HTTP ${resp.status}`)
            }
            data = await resp.json()
          }
          await runAction("rescan_intros", {})
          const importedName = (data && data.intro && data.intro.name) || file.name
          notify(tr("skin.introToastImported", { name: importedName }), "success")
        } catch (err) {
          notify(
            tr("skin.toastActionFailed", { message: extractErrorMessage(err, file.name) }),
            "error",
          )
        } finally {
          busy.value = false
        }
      }

      function exportIntroPack(introId) {
        const apiBase = buildApiBase(host.value, kt.package)
        const url = buildIntroExportZipUrl(apiBase, introId)
        if (!url || typeof document === "undefined") return
        const link = document.createElement("a")
        link.href = url
        link.download = `${introId}.zip`
        link.rel = "noopener"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      function downloadIntroTemplate() {
        const apiBase = buildApiBase(host.value, kt.package)
        const url = buildIntroTemplateZipUrl(apiBase)
        if (typeof document === "undefined") return
        const link = document.createElement("a")
        link.href = url
        link.download = "kohaku-intro-template.zip"
        link.rel = "noopener"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }

      async function deleteCustomIntro(pack) {
        const displayName = pack.name || pack.id
        const ok = await confirm(
          tr("skin.introConfirmDelete", { name: displayName }),
          tr("skin.introConfirmDeleteTitle", {}),
          {},
        )
        if (!ok) return
        try {
          await runAction("delete_custom_intro", { intro_id: pack.id })
          notify(tr("skin.introToastDeleted", { name: displayName }), "success")
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
      }

      async function onWorkshopCreated(createdIntro) {
        try {
          await runAction("rescan_intros", {})
        } catch (_handled) {
          // Error already surfaced via notify in runAction.
        }
        if (createdIntro) {
          previewIntroPack(createdIntro)
        }
      }

      return {
        owner,
        busy,
        skinFileInput,
        bgFileInput,
        introZipInput,
        workshopOpen,
        customUrlDraft,
        alphaDraft,
        blurDraft,
        dimDraft,
        readabilityDraft,
        introVolumeDraft,
        ownerState,
        skins,
        skinEnabled,
        activeSkinId,
        bgMode,
        bgFit,
        hasCustomWallpaper,
        customDirHint,
        intros,
        introPrefs,
        activeIntroPayload,
        customIntrosDirHint,
        wallpaperStatus,
        tr,
        skinLabel,
        skinDesc,
        introModeLabel,
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
        onReadabilityInput,
        applyPreset,
        updateIntroPref,
        onIntroVolumeInput,
        previewIntroPack,
        rescanIntros,
        triggerIntroZipImport,
        onIntroZipChange,
        exportIntroPack,
        downloadIntroTemplate,
        deleteCustomIntro,
        onWorkshopCreated,
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
          <input
            ref="introZipInput"
            class="ks-settings-hidden-input"
            type="file"
            accept=".zip"
            data-testid="ks-intro-zip-input"
            @change="onIntroZipChange"
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
                    <div class="ks-settings-skin-title">{{ skinLabel(skin) }}</div>
                    <div class="ks-settings-skin-meta">
                      {{ skin.author || tr("skin.metaCommunity", {}) }} / v{{ skin.version || "1.0.0" }}
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

                <p class="ks-settings-skin-desc">{{ skinDesc(skin) }}</p>

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
              :title="tr('skin.rowPresetsTitle', {})"
              :hint="tr('skin.rowPresetsHint', {})"
            >
              <div class="ks-settings-toolbar">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  data-test="ks-preset-clear-reading"
                  @click="applyPreset('clearReading')"
                >
                  {{ tr("skin.presetClearReading", {}) }}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  data-test="ks-preset-vivid-artwork"
                  @click="applyPreset('vividArtwork')"
                >
                  {{ tr("skin.presetVividArtwork", {}) }}
                </ActionButton>
              </div>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.rowReadabilityTitle', {})"
              :hint="tr('skin.rowReadabilityHint', {})"
            >
              <div class="ks-settings-slider-wrap">
                <input
                  class="ks-settings-slider"
                  type="range"
                  min="0.00"
                  max="1.00"
                  step="0.02"
                  :value="readabilityDraft"
                  data-test="ks-slider-readability"
                  @input="onReadabilityInput"
                />
                <span class="ks-settings-slider-val">{{ Math.round(readabilityDraft * 100) }}%</span>
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

          <SettingsGroup
            :title="tr('skin.groupIntroTitle', {})"
            :description="tr('skin.groupIntroDesc', {})"
            data-testid="ks-settings-intro-group"
          >
            <template #action>
              <div class="ks-settings-toolbar">
                <ActionButton
                  variant="primary"
                  size="sm"
                  :disabled="busy || intros.length === 0"
                  data-testid="ks-intro-preview-btn"
                  @click="previewIntroPack(null)"
                >
                  {{ tr("skin.introBtnPreview", {}) }}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  data-testid="ks-intro-create-btn"
                  @click="workshopOpen = true"
                >
                  {{ tr("skin.introBtnCreate", {}) }}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  :disabled="busy"
                  data-testid="ks-intro-import-btn"
                  @click="triggerIntroZipImport"
                >
                  {{ tr("skin.introBtnImportZip", {}) }}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  data-testid="ks-intro-rescan-btn"
                  @click="rescanIntros"
                >
                  {{ tr("skin.introBtnRescan", {}) }}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  data-testid="ks-intro-template-btn"
                  @click="downloadIntroTemplate"
                >
                  {{ tr("skin.introBtnTemplateZip", {}) }}
                </ActionButton>
              </div>
            </template>

            <SettingsRow
              :title="tr('skin.introEnableTitle', {})"
              :hint="tr('skin.introEnableHint', {})"
            >
              <button
                type="button"
                role="switch"
                :aria-checked="String(introPrefs.enabled)"
                class="ks-intro-switch"
                :class="{ 'is-on': introPrefs.enabled }"
                :disabled="busy"
                data-testid="ks-intro-toggle-enabled"
                @click="updateIntroPref({ enabled: !introPrefs.enabled })"
              >
                <span class="ks-intro-switch-dot" />
                <span>{{ introPrefs.enabled ? tr("skin.introToggleOn", {}) : tr("skin.introToggleOff", {}) }}</span>
              </button>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.introStartupTitle', {})"
              :hint="tr('skin.introStartupHint', {})"
            >
              <button
                type="button"
                role="switch"
                :aria-checked="String(introPrefs.play_on_startup)"
                class="ks-intro-switch"
                :class="{ 'is-on': introPrefs.play_on_startup }"
                :disabled="busy"
                data-testid="ks-intro-toggle-startup"
                @click="updateIntroPref({ play_on_startup: !introPrefs.play_on_startup })"
              >
                <span class="ks-intro-switch-dot" />
                <span>{{ introPrefs.play_on_startup ? tr("skin.introToggleOn", {}) : tr("skin.introToggleOff", {}) }}</span>
              </button>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.introKeepLiveTitle', {})"
              :hint="tr('skin.introKeepLiveHint', {})"
            >
              <button
                type="button"
                role="switch"
                :aria-checked="String(introPrefs.keep_live_wallpaper)"
                class="ks-intro-switch"
                :class="{ 'is-on': introPrefs.keep_live_wallpaper }"
                :disabled="busy"
                data-testid="ks-intro-toggle-live"
                @click="updateIntroPref({ keep_live_wallpaper: !introPrefs.keep_live_wallpaper })"
              >
                <span class="ks-intro-switch-dot" />
                <span>{{ introPrefs.keep_live_wallpaper ? tr("skin.introToggleOn", {}) : tr("skin.introToggleOff", {}) }}</span>
              </button>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.introMuteTitle', {})"
              :hint="tr('skin.introMuteHint', {})"
            >
              <button
                type="button"
                role="switch"
                :aria-checked="String(introPrefs.muted)"
                class="ks-intro-switch"
                :class="{ 'is-on': introPrefs.muted }"
                :disabled="busy"
                data-testid="ks-intro-toggle-muted"
                @click="updateIntroPref({ muted: !introPrefs.muted })"
              >
                <span class="ks-intro-switch-dot" />
                <span>{{ introPrefs.muted ? tr("skin.introToggleOn", {}) : tr("skin.introToggleOff", {}) }}</span>
              </button>
            </SettingsRow>

            <SettingsRow
              :title="tr('skin.introVolumeTitle', {})"
              :hint="tr('skin.introVolumeHint', {})"
            >
              <div class="ks-settings-slider-wrap">
                <input
                  class="ks-settings-slider"
                  type="range"
                  min="0.00"
                  max="1.00"
                  step="0.05"
                  :value="introVolumeDraft"
                  data-testid="ks-intro-slider-volume"
                  @input="onIntroVolumeInput"
                />
                <span class="ks-settings-slider-val">{{ Math.round(introVolumeDraft * 100) }}%</span>
              </div>
            </SettingsRow>

            <div v-if="intros.length === 0" class="ks-settings-banner" data-testid="ks-intro-empty">
              {{ tr("skin.introEmpty", {}) }}
            </div>
            <div v-else class="ks-settings-skin-grid" data-testid="ks-intro-grid">
              <div
                v-for="pack in intros"
                :key="pack.id"
                class="ks-settings-skin-card"
                :class="{ 'ks-settings-skin-card--active': introPrefs.enabled && introPrefs.active_intro_id === pack.id }"
                :data-testid="'ks-intro-card-' + pack.id"
              >
                <div class="ks-settings-skin-head">
                  <div>
                    <div class="ks-settings-skin-title">{{ pack.name || pack.id }}</div>
                    <div class="ks-settings-skin-meta">
                      {{ pack.author || tr("skin.metaCommunity", {}) }} / v{{ pack.version || "1.0.0" }} · {{ pack.duration }}s
                    </div>
                  </div>
                  <div class="ks-settings-badges">
                    <span class="ks-settings-badge">{{ introModeLabel(pack.mode) }}</span>
                    <span class="ks-settings-badge">{{ tr("skin.fxPreset." + (pack.fx_preset || "starlight-cyan"), {}) }}</span>
                    <span
                      class="ks-settings-badge"
                      :class="{ 'ks-settings-badge--custom': pack.source === 'custom' }"
                    >
                      {{ pack.source === "custom" ? tr("skin.badgeCustom", {}) : tr("skin.badgeBuiltin", {}) }}
                    </span>
                    <span
                      v-if="introPrefs.enabled && introPrefs.active_intro_id === pack.id"
                      class="ks-settings-badge ks-settings-badge--active"
                    >
                      {{ tr("skin.badgeActive", {}) }}
                    </span>
                  </div>
                </div>

                <p class="ks-settings-skin-desc">{{ pack.description || pack.id }}</p>

                <div class="ks-settings-card-actions">
                  <div class="ks-settings-toolbar">
                    <ActionButton
                      :variant="introPrefs.enabled && introPrefs.active_intro_id === pack.id ? 'secondary' : 'primary'"
                      size="sm"
                      :disabled="busy || (introPrefs.enabled && introPrefs.active_intro_id === pack.id)"
                      :data-testid="'ks-intro-activate-' + pack.id"
                      @click="updateIntroPref({ enabled: true, active_intro_id: pack.id })"
                    >
                      {{ introPrefs.enabled && introPrefs.active_intro_id === pack.id ? tr("skin.btnActive", {}) : tr("skin.btnActivate", {}) }}
                    </ActionButton>
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      :disabled="busy"
                      :data-testid="'ks-intro-play-' + pack.id"
                      @click="previewIntroPack(pack)"
                    >
                      {{ tr("skin.floatIntroPreview", {}) }}
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      :data-testid="'ks-intro-export-' + pack.id"
                      @click="exportIntroPack(pack.id)"
                    >
                      {{ tr("skin.introBtnExportZip", {}) }}
                    </ActionButton>
                  </div>
                  <ActionButton
                    v-if="pack.source === 'custom'"
                    variant="danger"
                    size="sm"
                    :disabled="busy"
                    :data-testid="'ks-intro-delete-' + pack.id"
                    @click="deleteCustomIntro(pack)"
                  >
                    {{ tr("skin.btnDelete", {}) }}
                  </ActionButton>
                </div>
              </div>
            </div>

            <div class="ks-settings-dir-hint">
              {{ tr("skin.introDirHint", { path: customIntrosDirHint }) }}
            </div>
          </SettingsGroup>

          <IntroWorkshopModal
            :open="workshopOpen"
            @close="workshopOpen = false"
            @created="onWorkshopCreated"
          />
        </template>
      </div>
    `,
  }
}
