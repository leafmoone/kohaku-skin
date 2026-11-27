/**
 * KohakuTerrarium UI extension entry for kohaku-skin.
 * Boots the runtime stage + native Session Floating Dock integration,
 * Settings preferences section, and command palette toggle shortcut.
 */

import { defineExtension } from "@kohakuterrarium/ui-sdk"

import {
  createDockPanelControl,
  createDockSkinPanel,
  createStatusSkinItem,
} from "./src/DockSkinPanel.js"
import { createSkinEngine } from "./src/engine.js"
import { createIntroPlaybackControl } from "./src/IntroStage.js"
import { createSettingsView } from "./src/SettingsView.js"

export default defineExtension((kt) => {
  const engine = createSkinEngine(kt.package)
  const panelControl = createDockPanelControl()
  const introControl = createIntroPlaybackControl()

  kt.onDispose(() => {
    introControl.stop()
    panelControl.dispose()
    engine.clearAll(typeof document !== "undefined" ? document : null)
  })

  kt.registerOverlay("stage", createDockSkinPanel(engine, panelControl, introControl), {})
  kt.registerStatusItem("quick-toggle", createStatusSkinItem(panelControl), {})
  kt.registerSettingsSection("preferences", createSettingsView(engine, introControl), {})
  kt.registerCommand("toggle-switcher", () => {
    panelControl.toggle()
  })
})
