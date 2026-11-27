/**
 * Real-time 2D Canvas particle and climax flare renderer for kohaku-skin intros
 * and low-power persistent live wallpapers.
 *
 * Supports 5 presets: starlight-cyan, amber-firefly, sakura-petals, cyber-neon,
 * and minimal-clean. Automatically throttles to ~27fps in ambient mode and pauses
 * completely when document.hidden is true for 0% background CPU usage.
 */

import { clampNumber, computeBurstState } from "./utils.js"

const AMBIENT_FRAME_INTERVAL_MS = 37

const PRESET_CONFIG = Object.freeze({
  "starlight-cyan": Object.freeze({
    introCount: 68,
    ambientCount: 26,
    colors: ["#e0f7ff", "#7dd3fc", "#a5f3fc", "#ffffff"],
    burstCore: "#ffffff",
    burstMid: "rgba(125, 211, 252, 0.72)",
    burstOuter: "rgba(56, 189, 248, 0)",
    beamColor: "rgba(165, 243, 252, 0.65)",
    spikes: 4,
    composite: "lighter",
  }),
  "amber-firefly": Object.freeze({
    introCount: 54,
    ambientCount: 22,
    colors: ["#fffbeb", "#fde68a", "#fbbf24", "#f59e0b"],
    burstCore: "#fffbeb",
    burstMid: "rgba(251, 191, 36, 0.74)",
    burstOuter: "rgba(245, 158, 11, 0)",
    beamColor: "rgba(253, 230, 138, 0.55)",
    spikes: 8,
    composite: "lighter",
  }),
  "sakura-petals": Object.freeze({
    introCount: 46,
    ambientCount: 18,
    colors: ["#fff1f2", "#fbcfe8", "#f9a8d4", "#f472b6"],
    burstCore: "#fff5f7",
    burstMid: "rgba(249, 168, 212, 0.68)",
    burstOuter: "rgba(244, 114, 182, 0)",
    beamColor: "rgba(253, 230, 138, 0.45)",
    spikes: 6,
    composite: "source-over",
  }),
  "cyber-neon": Object.freeze({
    introCount: 58,
    ambientCount: 22,
    colors: ["#22d3ee", "#e879f9", "#a855f7", "#e0f2fe"],
    burstCore: "#ffffff",
    burstMid: "rgba(232, 121, 249, 0.72)",
    burstOuter: "rgba(34, 211, 238, 0)",
    beamColor: "rgba(34, 211, 238, 0.72)",
    spikes: 4,
    composite: "lighter",
  }),
  "minimal-clean": Object.freeze({
    introCount: 0,
    ambientCount: 0,
    colors: [],
    burstCore: "#ffffff",
    burstMid: "rgba(255, 255, 255, 0)",
    burstOuter: "rgba(255, 255, 255, 0)",
    beamColor: "rgba(255, 255, 255, 0)",
    spikes: 0,
    composite: "lighter",
  }),
})

function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

function buildParticles(presetName, mode) {
  const cfg = PRESET_CONFIG[presetName] || PRESET_CONFIG["starlight-cyan"]
  const count = mode === "ambient" ? cfg.ambientCount : cfg.introCount
  const list = []
  for (let i = 0; i < count; i += 1) {
    const r1 = seededRandom(i * 3.1 + 1.7)
    const r2 = seededRandom(i * 5.3 + 2.9)
    const r3 = seededRandom(i * 7.7 + 4.1)
    const r4 = seededRandom(i * 11.1 + 6.3)
    const r5 = seededRandom(i * 13.7 + 8.9)
    const color = cfg.colors[i % cfg.colors.length] || "#ffffff"
    const speedBase = mode === "ambient" ? 0.008 : 0.018
    let vx = (r3 - 0.5) * speedBase
    let vy = -(0.006 + r4 * speedBase)
    if (presetName === "sakura-petals") {
      vx = 0.014 + r3 * 0.022
      vy = 0.018 + r4 * 0.028
    } else if (presetName === "cyber-neon") {
      vx = (r3 > 0.5 ? 1 : -1) * (0.015 + r4 * 0.025)
      vy = (r5 - 0.5) * 0.01
    }
    list.push({
      x: r1,
      y: r2,
      vx,
      vy,
      size: presetName === "sakura-petals" ? 4.5 + r3 * 5.5 : 1.4 + r3 * 3.2,
      phase: r4 * Math.PI * 2,
      twinkle: 1.2 + r5 * 2.8,
      depth: 0.4 + r4 * 0.6,
      rot: r1 * Math.PI * 2,
      vrot: (r2 - 0.5) * 1.4,
      color,
    })
  }
  return list
}

function drawStarBurst(ctx, width, height, burstState, cfg) {
  const cx = burstState.x * width
  const cy = burstState.y * height
  const baseRadius = Math.min(width, height) * 0.24 * burstState.scale
  const alpha = clampNumber(burstState.intensity, 0, 1.8, 0)
  if (alpha <= 0.01 || baseRadius <= 2) return

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  ctx.globalAlpha = Math.min(1, alpha)

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius)
  grad.addColorStop(0, cfg.burstCore)
  grad.addColorStop(0.28, cfg.burstMid)
  grad.addColorStop(1, cfg.burstOuter)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2)
  ctx.fill()

  const spikes = cfg.spikes || 4
  const spikeLen = baseRadius * 1.65
  const spikeHalfW = Math.max(2, baseRadius * 0.055)
  ctx.fillStyle = cfg.burstCore
  for (let i = 0; i < spikes; i += 1) {
    const angle = (Math.PI * i) / spikes
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(-spikeLen, 0)
    ctx.quadraticCurveTo(0, -spikeHalfW, spikeLen, 0)
    ctx.quadraticCurveTo(0, spikeHalfW, -spikeLen, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  if (burstState.anamorphic > 0.04) {
    const beamW = width * 0.62 * clampNumber(burstState.anamorphic, 0, 2, 1)
    const beamH = Math.max(3, baseRadius * 0.09)
    const beamGrad = ctx.createLinearGradient(cx - beamW, cy, cx + beamW, cy)
    beamGrad.addColorStop(0, "rgba(255, 255, 255, 0)")
    beamGrad.addColorStop(0.35, cfg.beamColor)
    beamGrad.addColorStop(0.5, cfg.burstCore)
    beamGrad.addColorStop(0.65, cfg.beamColor)
    beamGrad.addColorStop(1, "rgba(255, 255, 255, 0)")
    ctx.fillStyle = beamGrad
    ctx.fillRect(cx - beamW, cy - beamH * 0.5, beamW * 2, beamH)
  }

  ctx.restore()
}

function drawParticle(ctx, p, px, py, radius, alpha, presetName) {
  ctx.save()
  ctx.globalAlpha = clampNumber(alpha, 0, 1, 0)
  ctx.fillStyle = p.color

  if (presetName === "sakura-petals") {
    ctx.translate(px, py)
    ctx.rotate(p.rot)
    ctx.beginPath()
    ctx.ellipse(0, 0, radius, radius * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  if (presetName === "cyber-neon") {
    ctx.translate(px, py)
    ctx.rotate(Math.PI / 4)
    ctx.fillRect(-radius * 0.85, -radius * 0.85, radius * 1.7, radius * 1.7)
    ctx.restore()
    return
  }

  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  ctx.fill()

  if (presetName === "starlight-cyan" && radius > 2.4) {
    ctx.strokeStyle = p.color
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(px - radius * 2.2, py)
    ctx.lineTo(px + radius * 2.2, py)
    ctx.moveTo(px, py - radius * 2.2)
    ctx.lineTo(px, py + radius * 2.2)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Create a managed 2D canvas FX controller for either fullscreen intro playback
 * or low-power ambient live wallpaper mode.
 */
export function createFxCanvasController(canvasEl, options) {
  const opts = options && typeof options === "object" ? options : {}
  const doc = opts.doc || (typeof document !== "undefined" ? document : null)
  const win = opts.win || (typeof window !== "undefined" ? window : null)

  let preset = PRESET_CONFIG[opts.preset] ? opts.preset : "starlight-cyan"
  let mode = opts.mode === "ambient" ? "ambient" : "intro"
  let bursts = Array.isArray(opts.bursts) ? opts.bursts : []
  let particles = buildParticles(preset, mode)
  let currentTime = 0
  let outroFade = 0
  let parallaxX = 0
  let parallaxY = 0
  let rafId = null
  let running = false
  let disposed = false
  let lastRenderStamp = 0
  let width = 1280
  let height = 720

  function isHidden() {
    return Boolean(doc && doc.hidden === true)
  }

  function resize() {
    if (!canvasEl || !win) return
    const dpr = Math.min(2, Number(win.devicePixelRatio) || 1)
    const rect =
      typeof canvasEl.getBoundingClientRect === "function"
        ? canvasEl.getBoundingClientRect()
        : { width: win.innerWidth || 1280, height: win.innerHeight || 720 }
    width = Math.max(1, Math.round(rect.width || win.innerWidth || 1280))
    height = Math.max(1, Math.round(rect.height || win.innerHeight || 720))
    const targetW = Math.round(width * dpr)
    const targetH = Math.round(height * dpr)
    if (canvasEl.width !== targetW) canvasEl.width = targetW
    if (canvasEl.height !== targetH) canvasEl.height = targetH
    const ctx = typeof canvasEl.getContext === "function" ? canvasEl.getContext("2d") : null
    if (ctx && typeof ctx.setTransform === "function") {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }

  function renderFrame(dtSec, nowSec) {
    if (!canvasEl) return
    const ctx = typeof canvasEl.getContext === "function" ? canvasEl.getContext("2d") : null
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    const cfg = PRESET_CONFIG[preset] || PRESET_CONFIG["starlight-cyan"]
    if (preset === "minimal-clean") return

    const outroAlpha = 1 - clampNumber(outroFade, 0, 1, 0)
    if (outroAlpha <= 0.005) return

    ctx.save()
    ctx.globalCompositeOperation = cfg.composite

    const liftBoost = mode === "intro" && outroFade > 0 ? outroFade * 0.14 : 0
    for (const p of particles) {
      p.x += p.vx * dtSec
      p.y += (p.vy - liftBoost) * dtSec
      p.rot += p.vrot * dtSec
      if (p.x < -0.05) p.x += 1.1
      if (p.x > 1.05) p.x -= 1.1
      if (p.y < -0.05) p.y += 1.1
      if (p.y > 1.05) p.y -= 1.1

      const twinkle = 0.45 + 0.55 * Math.sin(nowSec * p.twinkle + p.phase)
      const baseAlpha = mode === "ambient" ? 0.52 : 0.88
      const alpha = twinkle * p.depth * baseAlpha * outroAlpha
      const px = p.x * width + parallaxX * p.depth * 18
      const py = p.y * height + parallaxY * p.depth * 14
      drawParticle(ctx, p, px, py, p.size * p.depth, alpha, preset)
    }

    if (preset === "cyber-neon" && mode === "intro") {
      ctx.globalCompositeOperation = "lighter"
      const scanY = ((nowSec * 0.22) % 1) * height
      const scanGrad = ctx.createLinearGradient(0, scanY - 14, 0, scanY + 14)
      scanGrad.addColorStop(0, "rgba(34, 211, 238, 0)")
      scanGrad.addColorStop(0.5, `rgba(34, 211, 238, ${(0.18 * outroAlpha).toFixed(3)})`)
      scanGrad.addColorStop(1, "rgba(34, 211, 238, 0)")
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 14, width, 28)
    }

    ctx.restore()

    if (mode === "intro" && bursts.length > 0) {
      for (const burst of bursts) {
        const activeBurst = computeBurstState(burst, currentTime)
        if (activeBurst) {
          drawStarBurst(ctx, width, height, activeBurst, cfg)
        }
      }
    }
  }

  function scheduleTick() {
    if (!running || disposed || isHidden() || !win || typeof win.requestAnimationFrame !== "function") {
      return
    }
    if (mode === "ambient" && preset === "minimal-clean") {
      renderFrame(0, 0)
      return
    }
    rafId = win.requestAnimationFrame((stamp) => {
      rafId = null
      if (!running || disposed || isHidden()) return
      if (mode === "ambient" && lastRenderStamp > 0 && stamp - lastRenderStamp < AMBIENT_FRAME_INTERVAL_MS) {
        scheduleTick()
        return
      }
      const dtSec = lastRenderStamp > 0 ? Math.min(0.1, (stamp - lastRenderStamp) / 1000) : 0.016
      lastRenderStamp = stamp
      renderFrame(dtSec, stamp / 1000)
      scheduleTick()
    })
  }

  function onVisibilityChange() {
    if (disposed || !running) return
    if (isHidden()) {
      if (rafId !== null && win && typeof win.cancelAnimationFrame === "function") {
        win.cancelAnimationFrame(rafId)
        rafId = null
      }
    } else {
      lastRenderStamp = 0
      scheduleTick()
    }
  }

  function start() {
    if (disposed || running) return
    running = true
    lastRenderStamp = 0
    resize()
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("resize", resize)
    }
    if (doc && typeof doc.addEventListener === "function") {
      doc.addEventListener("visibilitychange", onVisibilityChange)
    }
    scheduleTick()
  }

  function stop() {
    running = false
    if (rafId !== null && win && typeof win.cancelAnimationFrame === "function") {
      win.cancelAnimationFrame(rafId)
      rafId = null
    }
    if (win && typeof win.removeEventListener === "function") {
      win.removeEventListener("resize", resize)
    }
    if (doc && typeof doc.removeEventListener === "function") {
      doc.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }

  function setPreset(nextPreset) {
    const resolved = PRESET_CONFIG[nextPreset] ? nextPreset : "starlight-cyan"
    if (resolved !== preset) {
      preset = resolved
      particles = buildParticles(preset, mode)
    }
  }

  function setMode(nextMode) {
    const resolved = nextMode === "ambient" ? "ambient" : "intro"
    if (resolved !== mode) {
      mode = resolved
      particles = buildParticles(preset, mode)
    }
  }

  function setBursts(nextBursts) {
    bursts = Array.isArray(nextBursts) ? nextBursts : []
  }

  function setTime(t) {
    currentTime = Number.isFinite(t) ? t : 0
  }

  function setOutroFade(fade) {
    outroFade = clampNumber(fade, 0, 1, 0)
  }

  function setParallax(px, py) {
    parallaxX = clampNumber(px, -1, 1, 0)
    parallaxY = clampNumber(py, -1, 1, 0)
  }

  function dispose() {
    disposed = true
    stop()
    particles = []
    bursts = []
  }

  return {
    setPreset,
    setMode,
    setBursts,
    setTime,
    setOutroFade,
    setParallax,
    resize,
    start,
    stop,
    dispose,
  }
}
