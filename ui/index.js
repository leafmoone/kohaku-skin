/**
 * KohakuTerrarium UI extension entry for kohaku-skin.
 * Boots the runtime stage + native Session Floating Dock integration,
 * Settings preferences section, and command palette toggle shortcut.
 */

import { defineExtension } from "@kohakuterrarium/ui-sdk"

import { createDockPanelControl, createDockSkinPanel } from "./src/DockSkinPanel.js"
import { createSkinEngine } from "./src/engine.js"
import { createSettingsView } from "./src/SettingsView.js"

export default defineExtension((kt) => {
  const engine = createSkinEngine(kt.package)
  const panelControl = createDockPanelControl()

  kt.onDispose(() => {
    panelControl.dispose()
    engine.clearAll(typeof document !== "undefined" ? document : null)
  })

  kt.registerOverlay("stage", createDockSkinPanel(engine, panelControl), {})
  kt.registerSettingsSection("preferences", createSettingsView(engine), {})
  kt.registerCommand("toggle-switcher", () => {
    panelControl.toggle()
  })
})
