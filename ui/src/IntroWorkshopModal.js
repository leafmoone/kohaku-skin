/**
 * Zero-code Custom Boot Intro Workshop Modal for kohaku-skin.
 *
 * Allows creating either a 1-Image Auto Cinema ("single") pack with click-to-pick
 * focal point coordinates or an MP4/WebM Video ("video") pack with optional loop
 * video, custom audio or built-in synth:starlight, FX preset, and timed subtitles.
 */

import { Teleport, defineComponent, h, onBeforeUnmount, ref } from "vue"
import { notify, useExtension, useHost, useLocale } from "@kohakuterrarium/ui-sdk"

import { translateSkinText } from "./i18n.js"
import { buildApiBase, clampNumber, extractErrorMessage, FX_PRESETS } from "./utils.js"

export const IntroWorkshopModal = defineComponent({
  name: "KohakuSkinIntroWorkshopModal",
  props: {
    open: { type: Boolean, required: true },
  },
  emits: ["close", "created"],
  setup(props, { emit }) {
    const kt = useExtension()
    const host = useHost()
    const locale = useLocale()
    const tr = (key, params) => translateSkinText(locale.value, key, params)

    const mode = ref("single")
    const name = ref("")
    const duration = ref("11.5")
    const fxPreset = ref("starlight-cyan")
    const focalX = ref(0.5)
    const focalY = ref(0.45)
    const useSynthAudio = ref(true)
    const heroFile = ref(null)
    const heroPreviewUrl = ref("")
    const videoFile = ref(null)
    const loopVideoFile = ref(null)
    const audioFile = ref(null)
    const subtitles = ref([
      { in_sec: "1.2", out_sec: "4.6", primary: "", secondary: "" },
    ])
    const submitting = ref(false)
    const errorText = ref("")

    function revokePreview() {
      if (heroPreviewUrl.value && typeof URL !== "undefined") {
        URL.revokeObjectURL(heroPreviewUrl.value)
        heroPreviewUrl.value = ""
      }
    }

    onBeforeUnmount(() => {
      revokePreview()
    })

    function onHeroFileChange(ev) {
      const file = ev.target && ev.target.files && ev.target.files[0] ? ev.target.files[0] : null
      heroFile.value = file
      revokePreview()
      if (file && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        heroPreviewUrl.value = URL.createObjectURL(file)
      }
    }

    function onVideoFileChange(ev) {
      videoFile.value =
        ev.target && ev.target.files && ev.target.files[0] ? ev.target.files[0] : null
    }

    function onLoopVideoFileChange(ev) {
      loopVideoFile.value =
        ev.target && ev.target.files && ev.target.files[0] ? ev.target.files[0] : null
    }

    function onAudioFileChange(ev) {
      audioFile.value =
        ev.target && ev.target.files && ev.target.files[0] ? ev.target.files[0] : null
      if (audioFile.value) {
        useSynthAudio.value = false
      }
    }

    function onFocalPreviewClick(ev) {
      const target = ev.currentTarget
      if (!target || typeof target.getBoundingClientRect !== "function") return
      const rect = target.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) return
      const nx = clampNumber((ev.clientX - rect.left) / rect.width, 0, 1, 0.5)
      const ny = clampNumber((ev.clientY - rect.top) / rect.height, 0, 1, 0.45)
      focalX.value = Math.round(nx * 100) / 100
      focalY.value = Math.round(ny * 100) / 100
    }

    function addSubtitleRow() {
      subtitles.value = [
        ...subtitles.value,
        { in_sec: "5.0", out_sec: "8.2", primary: "", secondary: "" },
      ]
    }

    function removeSubtitleRow(index) {
      subtitles.value = subtitles.value.filter((_row, idx) => idx !== index)
    }

    function updateSubtitleField(index, key, val) {
      subtitles.value = subtitles.value.map((row, idx) =>
        idx === index ? { ...row, [key]: val } : row,
      )
    }

    async function handleSubmit() {
      errorText.value = ""
      const cleanName = name.value.trim()
      if (!cleanName) {
        errorText.value = tr("skin.workshopErrName", {})
        return
      }
      if (mode.value === "single" && !heroFile.value) {
        errorText.value = tr("skin.workshopErrHeroImage", {})
        return
      }
      if (mode.value === "video" && !videoFile.value) {
        errorText.value = tr("skin.workshopErrVideoFile", {})
        return
      }

      const durNum = clampNumber(duration.value, 2, 120, 11.5)
      const outroStart = Math.max(0.5, Math.round((durNum - Math.min(2.2, durNum * 0.2)) * 100) / 100)
      const cleanedSubs = subtitles.value
        .map((row) => ({
          in_sec: clampNumber(row.in_sec, 0, durNum, 0),
          out_sec: clampNumber(row.out_sec, 0, durNum, durNum),
          primary: String(row.primary || "").trim(),
          secondary: String(row.secondary || "").trim(),
        }))
        .filter((row) => (row.primary || row.secondary) && row.out_sec > row.in_sec)

      const spec = {
        name: cleanName,
        mode: mode.value,
        duration: durNum,
        outro_start: outroStart,
        fx_preset: fxPreset.value,
        focal_point: [focalX.value, focalY.value],
        secondary_point: [clampNumber(1 - focalX.value, 0, 1, 0.5), focalY.value],
        audio: !audioFile.value && useSynthAudio.value ? "synth:starlight" : "",
        subtitles: cleanedSubs,
      }

      const formData = new FormData()
      formData.append("spec_json", JSON.stringify(spec))
      formData.append("activate", "true")
      if (mode.value === "single" && heroFile.value) {
        formData.append("hero_image", heroFile.value)
      }
      if (mode.value === "video" && videoFile.value) {
        formData.append("video_file", videoFile.value)
      }
      if (loopVideoFile.value) {
        formData.append("loop_video_file", loopVideoFile.value)
      }
      if (audioFile.value) {
        formData.append("audio_file", audioFile.value)
      }

      submitting.value = true
      try {
        let data = null
        if (kt && kt.api && typeof kt.api.post === "function") {
          const resp = await kt.api.post("/intros/create", formData)
          data = resp && resp.data ? resp.data : null
        } else {
          const apiBase = buildApiBase(host.value, kt ? kt.package : "kohaku-skin")
          const resp = await fetch(`${apiBase}/intros/create`, {
            method: "POST",
            body: formData,
            credentials: "same-origin",
          })
          if (!resp.ok) {
            const text = await resp.text()
            throw new Error(text || `HTTP ${resp.status}`)
          }
          data = await resp.json()
        }
        notify(tr("skin.toastIntroCreated", { name: cleanName }), "success")
        emit("created", data && data.intro ? data.intro : null)
        emit("close")
      } catch (err) {
        errorText.value = extractErrorMessage(err, "Create intro failed")
      } finally {
        submitting.value = false
      }
    }

    return () => {
      if (!props.open) return null
      return h(Teleport, { to: "body" }, [
        h(
          "div",
          {
            class: "ks-workshop-backdrop",
            "data-testid": "ks-workshop-backdrop",
            onClick: () => {
              if (!submitting.value) emit("close")
            },
          },
          [
            h(
              "section",
              {
                class: "ks-workshop-modal",
                role: "dialog",
                "aria-modal": "true",
                "aria-label": tr("skin.workshopTitle", {}),
                "data-testid": "ks-workshop-modal",
                onClick: (ev) => ev.stopPropagation(),
              },
              [
                h("header", { class: "ks-workshop-header" }, [
                  h("div", null, [
                    h("h3", { class: "ks-workshop-title" }, tr("skin.workshopTitle", {})),
                    h("p", { class: "ks-workshop-subtitle" }, tr("skin.workshopSubtitle", {})),
                  ]),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "ks-dock-text-btn",
                      disabled: submitting.value,
                      "data-testid": "ks-workshop-close",
                      onClick: () => emit("close"),
                    },
                    tr("skin.btnClose", {}),
                  ),
                ]),

                h("div", { class: "ks-workshop-body" }, [
                  errorText.value
                    ? h(
                        "div",
                        {
                          class: "ks-workshop-error",
                          role: "alert",
                          "data-testid": "ks-workshop-error",
                        },
                        errorText.value,
                      )
                    : null,

                  h("div", { class: "ks-workshop-field" }, [
                    h("label", { class: "ks-workshop-label" }, tr("skin.workshopModeLabel", {})),
                    h("div", { class: "ks-settings-segmented" }, [
                      h(
                        "button",
                        {
                          type: "button",
                          class: [
                            "ks-settings-seg-btn",
                            mode.value === "single" ? "ks-settings-seg-btn--active" : "",
                          ],
                          "data-testid": "ks-workshop-mode-single",
                          onClick: () => {
                            mode.value = "single"
                          },
                        },
                        tr("skin.workshopModeSingle", {}),
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          class: [
                            "ks-settings-seg-btn",
                            mode.value === "video" ? "ks-settings-seg-btn--active" : "",
                          ],
                          "data-testid": "ks-workshop-mode-video",
                          onClick: () => {
                            mode.value = "video"
                          },
                        },
                        tr("skin.workshopModeVideo", {}),
                      ),
                    ]),
                  ]),

                  h("div", { class: "ks-workshop-grid" }, [
                    h("div", { class: "ks-workshop-field" }, [
                      h("label", { class: "ks-workshop-label" }, tr("skin.workshopNameLabel", {})),
                      h("input", {
                        type: "text",
                        class: "ks-settings-input",
                        value: name.value,
                        placeholder: tr("skin.workshopNamePlaceholder", {}),
                        "data-testid": "ks-workshop-name",
                        onInput: (ev) => {
                          name.value = ev.target.value
                        },
                      }),
                    ]),
                    h("div", { class: "ks-workshop-field" }, [
                      h(
                        "label",
                        { class: "ks-workshop-label" },
                        tr("skin.workshopDurationLabel", {}),
                      ),
                      h("input", {
                        type: "number",
                        min: "2",
                        max: "120",
                        step: "0.5",
                        class: "ks-settings-input",
                        value: duration.value,
                        "data-testid": "ks-workshop-duration",
                        onInput: (ev) => {
                          duration.value = ev.target.value
                        },
                      }),
                    ]),
                    h("div", { class: "ks-workshop-field" }, [
                      h("label", { class: "ks-workshop-label" }, tr("skin.workshopPresetLabel", {})),
                      h(
                        "select",
                        {
                          class: "ks-settings-input",
                          value: fxPreset.value,
                          "data-testid": "ks-workshop-preset",
                          onChange: (ev) => {
                            fxPreset.value = ev.target.value
                          },
                        },
                        FX_PRESETS.map((presetId) =>
                          h(
                            "option",
                            { key: presetId, value: presetId },
                            tr(`skin.fxPreset.${presetId}`, {}),
                          ),
                        ),
                      ),
                    ]),
                  ]),

                  mode.value === "single"
                    ? h("div", { class: "ks-workshop-field" }, [
                        h(
                          "label",
                          { class: "ks-workshop-label" },
                          tr("skin.workshopHeroLabel", {}),
                        ),
                        h("input", {
                          type: "file",
                          accept: ".png,.jpg,.jpeg,.webp",
                          class: "ks-workshop-file",
                          "data-testid": "ks-workshop-hero-input",
                          onChange: onHeroFileChange,
                        }),
                        heroPreviewUrl.value
                          ? h("div", { class: "ks-workshop-focal-wrap" }, [
                              h(
                                "div",
                                { class: "ks-workshop-focal-hint" },
                                tr("skin.workshopFocalHint", {
                                  x: Math.round(focalX.value * 100),
                                  y: Math.round(focalY.value * 100),
                                }),
                              ),
                              h(
                                "div",
                                {
                                  class: "ks-workshop-focal-stage",
                                  "data-testid": "ks-workshop-focal-preview",
                                  onClick: onFocalPreviewClick,
                                },
                                [
                                  h("img", {
                                    src: heroPreviewUrl.value,
                                    alt: tr("skin.workshopHeroLabel", {}),
                                    class: "ks-workshop-focal-img",
                                  }),
                                  h("span", {
                                    class: "ks-workshop-reticle",
                                    style: {
                                      left: `${(focalX.value * 100).toFixed(1)}%`,
                                      top: `${(focalY.value * 100).toFixed(1)}%`,
                                    },
                                  }),
                                ],
                              ),
                            ])
                          : null,
                      ])
                    : h("div", { class: "ks-workshop-grid" }, [
                        h("div", { class: "ks-workshop-field" }, [
                          h(
                            "label",
                            { class: "ks-workshop-label" },
                            tr("skin.workshopVideoLabel", {}),
                          ),
                          h("input", {
                            type: "file",
                            accept: ".mp4,.webm",
                            class: "ks-workshop-file",
                            "data-testid": "ks-workshop-video-input",
                            onChange: onVideoFileChange,
                          }),
                        ]),
                        h("div", { class: "ks-workshop-field" }, [
                          h(
                            "label",
                            { class: "ks-workshop-label" },
                            tr("skin.workshopLoopVideoLabel", {}),
                          ),
                          h("input", {
                            type: "file",
                            accept: ".mp4,.webm",
                            class: "ks-workshop-file",
                            "data-testid": "ks-workshop-loop-video-input",
                            onChange: onLoopVideoFileChange,
                          }),
                        ]),
                      ]),

                  h("div", { class: "ks-workshop-grid" }, [
                    h("div", { class: "ks-workshop-field" }, [
                      h("label", { class: "ks-workshop-label" }, tr("skin.workshopAudioLabel", {})),
                      h("input", {
                        type: "file",
                        accept: ".mp3,.wav,.ogg,.m4a",
                        class: "ks-workshop-file",
                        "data-testid": "ks-workshop-audio-input",
                        onChange: onAudioFileChange,
                      }),
                    ]),
                    h("div", { class: "ks-workshop-field ks-workshop-field--center" }, [
                      h("label", { class: "ks-workshop-check" }, [
                        h("input", {
                          type: "checkbox",
                          checked: useSynthAudio.value,
                          disabled: Boolean(audioFile.value),
                          "data-testid": "ks-workshop-synth-audio",
                          onChange: (ev) => {
                            useSynthAudio.value = Boolean(ev.target.checked)
                          },
                        }),
                        h("span", null, tr("skin.workshopUseSynthAudio", {})),
                      ]),
                    ]),
                  ]),

                  h("div", { class: "ks-workshop-field", "data-testid": "ks-workshop-subtitles" }, [
                    h("div", { class: "ks-workshop-subhead" }, [
                      h(
                        "label",
                        { class: "ks-workshop-label" },
                        tr("skin.workshopSubtitlesLabel", {}),
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          class: "ks-dock-text-btn",
                          "data-testid": "ks-workshop-add-subtitle",
                          onClick: addSubtitleRow,
                        },
                        tr("skin.workshopAddSubtitle", {}),
                      ),
                    ]),
                    ...subtitles.value.map((row, idx) =>
                      h("div", { key: idx, class: "ks-workshop-subrow" }, [
                        h("input", {
                          type: "number",
                          min: "0",
                          max: "120",
                          step: "0.1",
                          class: "ks-settings-input ks-workshop-time",
                          value: row.in_sec,
                          placeholder: "in",
                          onInput: (ev) => updateSubtitleField(idx, "in_sec", ev.target.value),
                        }),
                        h("input", {
                          type: "number",
                          min: "0",
                          max: "120",
                          step: "0.1",
                          class: "ks-settings-input ks-workshop-time",
                          value: row.out_sec,
                          placeholder: "out",
                          onInput: (ev) => updateSubtitleField(idx, "out_sec", ev.target.value),
                        }),
                        h("input", {
                          type: "text",
                          class: "ks-settings-input",
                          value: row.primary,
                          placeholder: tr("skin.workshopSubPrimaryPlaceholder", {}),
                          onInput: (ev) => updateSubtitleField(idx, "primary", ev.target.value),
                        }),
                        h("input", {
                          type: "text",
                          class: "ks-settings-input",
                          value: row.secondary,
                          placeholder: tr("skin.workshopSubSecondaryPlaceholder", {}),
                          onInput: (ev) => updateSubtitleField(idx, "secondary", ev.target.value),
                        }),
                        h(
                          "button",
                          {
                            type: "button",
                            class: "ks-dock-text-btn",
                            onClick: () => removeSubtitleRow(idx),
                          },
                          tr("skin.btnDelete", {}),
                        ),
                      ]),
                    ),
                  ]),
                ]),

                h("footer", { class: "ks-workshop-footer" }, [
                  h(
                    "button",
                    {
                      type: "button",
                      class: "ks-dock-btn",
                      disabled: submitting.value,
                      onClick: () => emit("close"),
                    },
                    tr("skin.btnClose", {}),
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "ks-dock-btn ks-workshop-submit-btn",
                      disabled: submitting.value,
                      "data-testid": "ks-workshop-submit",
                      onClick: () => void handleSubmit(),
                    },
                    tr(
                      submitting.value ? "skin.workshopSubmitting" : "skin.workshopSubmit",
                      {},
                    ),
                  ),
                ]),
              ],
            ),
          ],
        ),
      ])
    }
  },
})
