/**
 * Fullscreen one-shot cinematic boot intro stage for kohaku-skin.
 *
 * Supports three modes:
 * - "director": multi-layer smoothstep reveals (radial / wipe / fade) + camera breathing + mouse parallax
 * - "single": 1-image automatic 3-stage cinema (SVG glowing lineart -> neon bloom -> crisp hero)
 * - "video": fullscreen object-fit cover video playback with synced audio fade
 *
 * Uses quintic smootherstep outro dissolution with immediate pointer-events release,
 * Web Audio synth:starlight harmonic generator, and zero-error autoplay unlock UX.
 */

import { Teleport, computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useLocale } from "@kohakuterrarium/ui-sdk"

import { createFxCanvasController } from "./IntroFxCanvas.js"
import { translateSkinText } from "./i18n.js"
import {
  buildApiBase,
  buildIntroAssetUrl,
  clampNumber,
  computeLayerOpacity,
  findActiveSubtitle,
  normalizeIntroPrefs,
  normalizeMotionPointPair,
  normalizePointPair,
  smootherstep,
  smoothstep,
} from "./utils.js"

let hasAutoPlayedStartupInTab = false

/**
 * Create a reactive playback controller shared between DockSkinPanel, SettingsView, and IntroStage.
 */
export function createIntroPlaybackControl() {
  const playing = ref(false)
  const replaySeq = ref(0)
  const requestedPayload = ref(null)

  function requestReplay(payload) {
    requestedPayload.value = payload && typeof payload === "object" ? payload : null
    replaySeq.value += 1
  }

  function stop() {
    playing.value = false
    requestedPayload.value = null
  }

  return {
    playing,
    replaySeq,
    requestedPayload,
    requestReplay,
    stop,
  }
}

function createStarlightSynth(durationSec, outroStartSec, initialVolume, isMuted) {
  const AudioCtx =
    typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null
  if (!AudioCtx) return null
  let ctx = null
  try {
    ctx = new AudioCtx()
  } catch (_err) {
    return null
  }
  const master = ctx.createGain()
  const baseVol = isMuted ? 0 : clampNumber(initialVolume, 0, 1, 0.85) * 0.22
  const now = ctx.currentTime
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(Math.max(0.0001, baseVol), now + 1.4)
  master.connect(ctx.destination)

  const notes = [261.63, 329.63, 392.0, 523.25, 659.25]
  const oscillators = []
  for (let i = 0; i < notes.length; i += 1) {
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = i % 2 === 0 ? "sine" : "triangle"
    osc.frequency.setValueAtTime(notes[i], now)
    oscGain.gain.setValueAtTime(0.16 / notes.length, now)
    osc.connect(oscGain)
    oscGain.connect(master)
    osc.start(now)
    osc.stop(now + durationSec + 0.3)
    oscillators.push(osc)
  }

  const climaxAt = now + Math.min(outroStartSec * 0.72, durationSec * 0.58)
  const chimeNotes = [783.99, 1046.5, 1318.51]
  for (let i = 0; i < chimeNotes.length; i += 1) {
    const chime = ctx.createOscillator()
    const chimeGain = ctx.createGain()
    const startAt = climaxAt + i * 0.14
    chime.type = "sine"
    chime.frequency.setValueAtTime(chimeNotes[i], startAt)
    chimeGain.gain.setValueAtTime(0.0001, startAt)
    chimeGain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.08)
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.8)
    chime.connect(chimeGain)
    chimeGain.connect(master)
    chime.start(startAt)
    chime.stop(startAt + 1.9)
    oscillators.push(chime)
  }

  let closed = false

  function updateGain(volume, muted, fadeFactor) {
    if (closed || !ctx || ctx.state === "closed") return
    const target = muted ? 0 : clampNumber(volume, 0, 1, 0.85) * 0.22 * clampNumber(fadeFactor, 0, 1, 1)
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.06)
  }

  function unlock() {
    if (closed || !ctx || ctx.state === "closed") return Promise.resolve(false)
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      return ctx.resume().then(() => true).catch(() => false)
    }
    return Promise.resolve(true)
  }

  function isSuspended() {
    return !closed && ctx && ctx.state === "suspended"
  }

  function close() {
    if (closed) return
    closed = true
    for (const osc of oscillators) {
      try {
        osc.stop()
      } catch (_err) {
        // Ignore already-stopped oscillator.
      }
    }
    try {
      void ctx.close()
    } catch (_err) {
      // Ignore close errors.
    }
  }

  return { updateGain, unlock, isSuspended, close }
}

function buildMaskStyle(layer, t) {
  const reveal = layer && typeof layer.reveal === "string" ? layer.reveal : "fade"
  const inSec = clampNumber(layer.in_sec, 0, 120, 0)
  const inDur = Math.max(0.25, clampNumber(layer.in_dur, 0, 60, 1.2))
  const progress = smoothstep(inSec, inSec + inDur, t)

  if (reveal === "radial") {
    const origin = normalizeMotionPointPair(layer.origin, 0.5, 0.5)
    const ox = `${(origin[0] * 100).toFixed(1)}%`
    const oy = `${(origin[1] * 100).toFixed(1)}%`
    const radius = progress * 145
    const feather = Math.min(165, radius + 24)
    const maskVal = `radial-gradient(circle at ${ox} ${oy}, #000 ${radius.toFixed(1)}%, transparent ${feather.toFixed(1)}%)`
    return { maskImage: maskVal, WebkitMaskImage: maskVal }
  }

  if (reveal === "wipe") {
    const edge = progress * 135 - 15
    const feather = edge + 26
    const maskVal = `linear-gradient(125deg, #000 ${edge.toFixed(1)}%, transparent ${feather.toFixed(1)}%)`
    return { maskImage: maskVal, WebkitMaskImage: maskVal }
  }

  return {}
}

function buildSvgControlIcon(paths) {
  return h(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: "13",
      height: "13",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    paths.map((p) => h(p.tag, p.attrs)),
  )
}

function iconVolumeOn() {
  return buildSvgControlIcon([
    { tag: "polygon", attrs: { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" } },
    { tag: "path", attrs: { d: "M15.54 8.46a5 5 0 0 1 0 7.07" } },
    { tag: "path", attrs: { d: "M19.07 4.93a10 10 0 0 1 0 14.14" } },
  ])
}

function iconVolumeOff() {
  return buildSvgControlIcon([
    { tag: "polygon", attrs: { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" } },
    { tag: "line", attrs: { x1: "23", y1: "9", x2: "17", y2: "15" } },
    { tag: "line", attrs: { x1: "17", y1: "9", x2: "23", y2: "15" } },
  ])
}

function iconReplay() {
  return buildSvgControlIcon([
    { tag: "polyline", attrs: { points: "1 4 1 10 7 10" } },
    { tag: "path", attrs: { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" } },
  ])
}

export function createIntroStageComponent(playbackControl) {
  return defineComponent({
    name: "KohakuSkinIntroStage",
    props: {
      ownerState: { type: Object, default: null },
      hostInfo: { type: Object, default: null },
      pkgName: { type: String, required: true },
    },
    setup(props) {
      let locale = ref("en")
      try {
        locale = useLocale()
      } catch (_err) {
        locale = ref("en")
      }

      const tr = (key, params) => translateSkinText(locale.value, key, params)

      const activePayload = ref(null)
      const currentTime = ref(0)
      const outroProgress = ref(0)
      const audioMuted = ref(false)
      const audioBlocked = ref(false)
      const parallaxX = ref(0)
      const parallaxY = ref(0)
      const canvasEl = ref(null)
      const videoEl = ref(null)

      let rafId = null
      let startPerfMs = 0
      let targetParallaxX = 0
      let targetParallaxY = 0
      let fxController = null
      let htmlAudio = null
      let synthAudio = null
      let keyListenerBound = false

      const introPrefs = computed(() =>
        normalizeIntroPrefs(
          props.ownerState && props.ownerState.preferences ? props.ownerState.preferences.intro : null,
        ),
      )

      const apiBase = computed(() => buildApiBase(props.hostInfo, props.pkgName))

      const isOutroPhase = computed(() => {
        const p = activePayload.value
        if (!p) return false
        return currentTime.value >= clampNumber(p.outro_start, 0.5, 120, 8.5)
      })

      const activeSubtitle = computed(() => {
        const p = activePayload.value
        if (!p) return null
        return findActiveSubtitle(p.subtitles, currentTime.value)
      })

      function cleanupMediaAndTimers() {
        if (rafId !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(rafId)
          rafId = null
        }
        if (fxController) {
          fxController.dispose()
          fxController = null
        }
        if (htmlAudio) {
          try {
            htmlAudio.pause()
            htmlAudio.src = ""
          } catch (_err) {
            // Ignore audio teardown errors.
          }
          htmlAudio = null
        }
        if (synthAudio) {
          synthAudio.close()
          synthAudio = null
        }
        if (videoEl.value) {
          try {
            videoEl.value.pause()
          } catch (_err) {
            // Ignore video pause errors.
          }
        }
        if (keyListenerBound && typeof window !== "undefined") {
          window.removeEventListener("keydown", onWindowKeydown, true)
          window.removeEventListener("pointermove", onWindowPointerMove)
          keyListenerBound = false
        }
      }

      function finishPlayback() {
        cleanupMediaAndTimers()
        playbackControl.playing.value = false
        activePayload.value = null
        currentTime.value = 0
        outroProgress.value = 0
        audioBlocked.value = false
      }

      function onWindowKeydown(event) {
        if (!playbackControl.playing.value || !event) return
        if (event.key === "Escape") {
          event.preventDefault()
          finishPlayback()
        }
      }

      function onWindowPointerMove(event) {
        if (!playbackControl.playing.value || typeof window === "undefined") return
        const nx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2
        const ny = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2
        targetParallaxX = clampNumber(nx, -1, 1, 0)
        targetParallaxY = clampNumber(ny, -1, 1, 0)
      }

      function computeEffectiveBursts(payload) {
        if (Array.isArray(payload.bursts) && payload.bursts.length > 0) {
          return payload.bursts
        }
        if (payload.mode === "single") {
          const dur = clampNumber(payload.duration, 2, 120, 11.5)
          const focal = normalizePointPair(payload.focal_point, 0.5, 0.45)
          return [
            {
              start_sec: dur * 0.58,
              end_sec: Math.min(dur * 0.82, dur - 0.6),
              from_point: focal,
              to_point: focal,
              scale: 1.35,
              intensity: 1.25,
              anamorphic: 1.15,
            },
          ]
        }
        return []
      }

      function startAudioTrack(payload) {
        const audioSpec = typeof payload.audio === "string" ? payload.audio.trim() : ""
        if (!audioSpec) return
        const vol = introPrefs.value.volume
        const muted = audioMuted.value
        const dur = clampNumber(payload.duration, 2, 120, 11.5)
        const outroStart = clampNumber(payload.outro_start, 0.5, dur, Math.max(0.5, dur - 2.2))

        if (audioSpec === "synth:starlight") {
          synthAudio = createStarlightSynth(dur, outroStart, vol, muted)
          if (synthAudio && synthAudio.isSuspended()) {
            audioBlocked.value = true
          }
          return
        }

        if (typeof Audio !== "function") return
        const url = buildIntroAssetUrl(apiBase.value, payload.id, audioSpec)
        if (!url) return
        const audio = new Audio(url)
        audio.preload = "auto"
        audio.volume = muted ? 0 : vol
        audio.muted = muted
        htmlAudio = audio
        const playPromise = audio.play()
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            if (htmlAudio === audio) {
              audioBlocked.value = true
            }
          })
        }
      }

      function unlockOrToggleAudio() {
        if (audioBlocked.value) {
          audioBlocked.value = false
          audioMuted.value = false
          if (synthAudio) {
            void synthAudio.unlock()
            synthAudio.updateGain(introPrefs.value.volume, false, 1 - outroProgress.value)
          }
          if (htmlAudio) {
            htmlAudio.muted = false
            htmlAudio.volume = introPrefs.value.volume * (1 - outroProgress.value)
            try {
              if (Number.isFinite(htmlAudio.duration) && currentTime.value < htmlAudio.duration) {
                htmlAudio.currentTime = currentTime.value
              }
            } catch (_err) {
              // Ignore seek errors before metadata ready.
            }
            void htmlAudio.play().catch(() => {})
          }
          if (videoEl.value) {
            videoEl.value.muted = false
            videoEl.value.volume = introPrefs.value.volume * (1 - outroProgress.value)
          }
          return
        }

        audioMuted.value = !audioMuted.value
        const fade = 1 - outroProgress.value
        if (synthAudio) {
          synthAudio.updateGain(introPrefs.value.volume, audioMuted.value, fade)
        }
        if (htmlAudio) {
          htmlAudio.muted = audioMuted.value
          htmlAudio.volume = audioMuted.value ? 0 : introPrefs.value.volume * fade
        }
        if (videoEl.value) {
          videoEl.value.muted = audioMuted.value
          videoEl.value.volume = audioMuted.value ? 0 : introPrefs.value.volume * fade
        }
      }

      async function beginPlayback(payload) {
        if (!payload || typeof payload !== "object" || !payload.id) return
        cleanupMediaAndTimers()

        activePayload.value = payload
        currentTime.value = 0
        outroProgress.value = 0
        audioMuted.value = Boolean(introPrefs.value.muted)
        audioBlocked.value = false
        parallaxX.value = 0
        parallaxY.value = 0
        targetParallaxX = 0
        targetParallaxY = 0
        playbackControl.playing.value = true

        await nextTick()

        if (!playbackControl.playing.value || !activePayload.value) return

        if (canvasEl.value) {
          fxController = createFxCanvasController(canvasEl.value, {
            preset: payload.fx_preset,
            mode: "intro",
            bursts: computeEffectiveBursts(payload),
            doc: typeof document !== "undefined" ? document : null,
            win: typeof window !== "undefined" ? window : null,
          })
          fxController.start()
        }

        if (payload.mode === "video" && videoEl.value) {
          videoEl.value.currentTime = 0
          videoEl.value.muted = audioMuted.value
          videoEl.value.volume = audioMuted.value ? 0 : introPrefs.value.volume
          const vp = videoEl.value.play()
          if (vp && typeof vp.catch === "function") {
            vp.catch(() => {
              if (videoEl.value) {
                videoEl.value.muted = true
                audioBlocked.value = true
                void videoEl.value.play().catch(() => {})
              }
            })
          }
        }

        startAudioTrack(payload)

        if (!keyListenerBound && typeof window !== "undefined") {
          window.addEventListener("keydown", onWindowKeydown, true)
          window.addEventListener("pointermove", onWindowPointerMove)
          keyListenerBound = true
        }

        const dur = clampNumber(payload.duration, 2, 120, 11.5)
        const outroStart = clampNumber(payload.outro_start, 0.5, dur, Math.max(0.5, dur - 2.2))
        startPerfMs = typeof performance !== "undefined" ? performance.now() : Date.now()

        const tick = () => {
          if (!playbackControl.playing.value || !activePayload.value) return
          const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now()
          const elapsed = Math.max(0, (nowMs - startPerfMs) / 1000)
          currentTime.value = elapsed

          parallaxX.value += (targetParallaxX - parallaxX.value) * 0.08
          parallaxY.value += (targetParallaxY - parallaxY.value) * 0.08

          const outro = elapsed >= outroStart ? smootherstep(outroStart, dur, elapsed) : 0
          outroProgress.value = outro

          if (fxController) {
            fxController.setTime(elapsed)
            fxController.setOutroFade(outro)
            fxController.setParallax(parallaxX.value, parallaxY.value)
          }

          const fade = 1 - outro
          if (synthAudio) {
            synthAudio.updateGain(introPrefs.value.volume, audioMuted.value, fade)
          }
          if (htmlAudio && !audioBlocked.value) {
            htmlAudio.volume = audioMuted.value ? 0 : introPrefs.value.volume * fade
          }
          if (videoEl.value && !audioBlocked.value) {
            videoEl.value.volume = audioMuted.value ? 0 : introPrefs.value.volume * fade
          }

          if (elapsed >= dur) {
            finishPlayback()
            return
          }
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            rafId = window.requestAnimationFrame(tick)
          }
        }

        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          rafId = window.requestAnimationFrame(tick)
        }
      }

      function onBackdropClick() {
        if (audioBlocked.value) {
          unlockOrToggleAudio()
          return
        }
        finishPlayback()
      }

      watch(
        () => props.ownerState,
        (nextState) => {
          if (hasAutoPlayedStartupInTab || !nextState) return
          const prefs = normalizeIntroPrefs(
            nextState.preferences ? nextState.preferences.intro : null,
          )
          const payload = nextState.active_intro_payload
          if (prefs.enabled && prefs.play_on_startup && payload && payload.id) {
            hasAutoPlayedStartupInTab = true
            void beginPlayback(payload)
          }
        },
        { immediate: true },
      )

      watch(
        () => playbackControl.replaySeq.value,
        (seq) => {
          if (seq <= 0) return
          const payload =
            playbackControl.requestedPayload.value ||
            (props.ownerState ? props.ownerState.active_intro_payload : null)
          if (payload) {
            void beginPlayback(payload)
          }
        },
      )

      watch(
        () => playbackControl.playing.value,
        (val) => {
          if (!val && activePayload.value) {
            finishPlayback()
          }
        },
      )

      onBeforeUnmount(() => {
        cleanupMediaAndTimers()
      })

      function renderLayers(payload) {
        const t = currentTime.value
        const dur = clampNumber(payload.duration, 2, 120, 11.5)
        const breath = 1.02 + 0.045 * smoothstep(0, dur, t)
        const tx = (-parallaxX.value * 14).toFixed(1)
        const ty = (-parallaxY.value * 10).toFixed(1)
        const cameraTransform = `translate3d(${tx}px, ${ty}px, 0) scale(${breath.toFixed(4)})`

        if (payload.mode === "video") {
          const videoUrl = buildIntroAssetUrl(apiBase.value, payload.id, payload.video)
          return [
            h("video", {
              ref: videoEl,
              class: "ks-intro-video",
              src: videoUrl,
              playsinline: true,
              autoplay: true,
              muted: audioMuted.value,
              style: { transform: cameraTransform },
              "data-testid": "ks-intro-video",
            }),
          ]
        }

        if (payload.mode === "single") {
          const imgUrl = buildIntroAssetUrl(apiBase.value, payload.id, payload.auto_stages_image)
          const focal = normalizePointPair(payload.focal_point, 0.5, 0.45)
          const stage1 = {
            in_sec: 0.05,
            in_dur: Math.max(0.8, dur * 0.28),
            out_sec: dur * 0.36,
            out_dur: Math.max(0.6, dur * 0.14),
            reveal: "radial",
            origin: focal,
          }
          const stage2 = {
            in_sec: dur * 0.16,
            in_dur: Math.max(0.8, dur * 0.24),
            out_sec: dur * 0.5,
            out_dur: Math.max(0.6, dur * 0.14),
            reveal: "radial",
            origin: focal,
          }
          const stage3 = {
            in_sec: dur * 0.34,
            in_dur: Math.max(0.9, dur * 0.24),
            out_sec: 0,
            out_dur: 0,
            reveal: "radial",
            origin: focal,
          }
          const stages = [
            { spec: stage1, cls: "ks-intro-layer ks-intro-layer--edge" },
            { spec: stage2, cls: "ks-intro-layer ks-intro-layer--neon" },
            { spec: stage3, cls: "ks-intro-layer ks-intro-layer--hero" },
          ]
          return stages.map((entry, idx) => {
            const opacity = computeLayerOpacity(entry.spec, t)
            const mask = buildMaskStyle(entry.spec, t)
            return h("div", {
              key: `single-${idx}`,
              class: entry.cls,
              style: {
                backgroundImage: imgUrl ? `url("${imgUrl}")` : "none",
                opacity: opacity.toFixed(3),
                transform: cameraTransform,
                ...mask,
              },
            })
          })
        }

        const layers = Array.isArray(payload.layers) ? payload.layers : []
        return layers.map((layer, idx) => {
          const opacity = computeLayerOpacity(layer, t)
          const mask = buildMaskStyle(layer, t)
          const url = buildIntroAssetUrl(apiBase.value, payload.id, layer.src)
          return h("div", {
            key: `layer-${idx}-${layer.src}`,
            class: "ks-intro-layer",
            style: {
              backgroundImage: url ? `url("${url}")` : "none",
              opacity: opacity.toFixed(3),
              transform: cameraTransform,
              ...mask,
            },
          })
        })
      }

      return () => {
        const payload = activePayload.value
        if (!playbackControl.playing.value || !payload) return null

        const overlayOpacity = (1 - outroProgress.value).toFixed(3)
        const sub = activeSubtitle.value

        return h(Teleport, { to: "body" }, [
          h(
            "div",
            {
              id: "kohaku-skin-intro-overlay",
              class: ["ks-intro-overlay", isOutroPhase.value ? "is-outro" : ""],
              style: {
                opacity: overlayOpacity,
                pointerEvents: isOutroPhase.value ? "none" : "auto",
              },
              "data-testid": "ks-intro-overlay",
              onClick: onBackdropClick,
            },
            [
              h(
                "svg",
                {
                  class: "ks-intro-svg-defs",
                  width: "0",
                  height: "0",
                  "aria-hidden": "true",
                },
                [
                  h("defs", null, [
                    h("filter", { id: "ks-intro-edge-filter" }, [
                      h("feConvolveMatrix", {
                        order: "3",
                        kernelMatrix: "-1 -1 -1 -1 8 -1 -1 -1 -1",
                        preserveAlpha: "true",
                        result: "edges",
                      }),
                      h("feColorMatrix", {
                        in: "edges",
                        type: "matrix",
                        values:
                          "0.2 0.2 0.6 0 0  0.3 0.8 1.0 0 0  0.4 0.9 1.2 0 0  0 0 0 1 0",
                        result: "glowTint",
                      }),
                      h("feGaussianBlur", {
                        in: "glowTint",
                        stdDeviation: "1.1",
                        result: "softGlow",
                      }),
                      h("feMerge", null, [
                        h("feMergeNode", { in: "softGlow" }),
                        h("feMergeNode", { in: "glowTint" }),
                      ]),
                    ]),
                  ]),
                ],
              ),
              ...renderLayers(payload),
              h("canvas", {
                ref: canvasEl,
                class: "ks-intro-fx-canvas",
                "aria-hidden": "true",
                "data-testid": "ks-intro-fx-canvas",
              }),
              sub
                ? h(
                    "div",
                    {
                      class: "ks-intro-subtitles",
                      style: { opacity: sub.opacity.toFixed(3) },
                      "data-testid": "ks-intro-subtitles",
                    },
                    [
                      sub.primary ? h("div", { class: "ks-intro-sub-primary" }, sub.primary) : null,
                      sub.secondary
                        ? h("div", { class: "ks-intro-sub-secondary" }, sub.secondary)
                        : null,
                    ],
                  )
                : null,
              h(
                "div",
                {
                  class: "ks-intro-controls",
                  "data-testid": "ks-intro-controls",
                  onClick: (ev) => ev.stopPropagation(),
                },
                [
                  h(
                    "button",
                    {
                      type: "button",
                      class: ["ks-intro-ctrl-btn", audioBlocked.value ? "is-accent" : ""],
                      "data-testid": "ks-intro-mute",
                      onClick: unlockOrToggleAudio,
                    },
                    [
                      audioMuted.value || audioBlocked.value ? iconVolumeOff() : iconVolumeOn(),
                      h(
                        "span",
                        null,
                        audioBlocked.value
                          ? tr("skin.introClickToUnmute", {})
                          : audioMuted.value
                            ? tr("skin.introSoundOff", {})
                            : tr("skin.introSoundOn", {}),
                      ),
                    ],
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "ks-intro-ctrl-btn",
                      "data-testid": "ks-intro-replay",
                      onClick: () => void beginPlayback(payload),
                    },
                    [iconReplay(), h("span", null, tr("skin.introBtnReplay", {}))],
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      class: "ks-intro-ctrl-btn",
                      "data-testid": "ks-intro-skip",
                      onClick: finishPlayback,
                    },
                    [h("span", null, tr("skin.introBtnSkip", {}))],
                  ),
                ],
              ),
            ],
          ),
        ])
      }
    },
  })
}
