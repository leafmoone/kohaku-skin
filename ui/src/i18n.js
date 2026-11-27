/**
 * Bundled reactive i18n dictionary and host label synchronizer for kohaku-skin.
 * Provides instant, zero-fetch localization across en, zh-CN, and zh-TW even in
 * Desktop mode where LaunchTokenMiddleware blocks credential-omitted JSON fetches.
 */

export const BUNDLES = Object.freeze({
  en: Object.freeze({
    "skin.title": "Skin & Appearance",
    "skin.groupSkinsTitle": "UI Skins & Community Packs",
    "skin.groupSkinsDesc":
      "Switch between native stock KohakuTerrarium, built-in example skins, or imported community skin packs.",
    "skin.groupBgTitle": "Background Image & Glass",
    "skin.groupBgDesc":
      "Overlay a custom wallpaper or follow the active skin's default background. Works even when no UI skin is loaded.",
    "skin.defaultName": "Default (No Skin Loaded)",
    "skin.defaultDesc":
      "Stock KohakuTerrarium appearance with zero skin CSS or token overrides.",
    "skin.badgeActive": "Active",
    "skin.badgeBuiltin": "Built-in",
    "skin.badgeCustom": "Custom",
    "skin.badgeStock": "Stock",
    "skin.btnActivate": "Activate",
    "skin.btnActive": "Active",
    "skin.btnDelete": "Delete",
    "skin.btnRescan": "Rescan Skins",
    "skin.btnImport": "Import Skin (.zip / .css)",
    "skin.btnTemplate": "Starter Template (.zip)",
    "skin.btnUploadBg": "Upload Image",
    "skin.btnApplyUrl": "Apply URL",
    "skin.btnClearBg": "Clear Wallpaper",
    "skin.btnOpenSettingsShort": "Settings",
    "skin.btnClose": "Close",
    "skin.rowModeTitle": "Background Mode",
    "skin.rowModeHint":
      "Choose whether to hide the background layer, follow the active skin, or use a custom image.",
    "skin.modeOff": "Off",
    "skin.modeSkin": "Follow Skin",
    "skin.modeCustom": "Custom Image",
    "skin.rowWallpaperTitle": "Custom Background Source",
    "skin.rowWallpaperHint":
      "Upload a local PNG/JPG/WebP/GIF/SVG image or paste an image URL.",
    "skin.wallpaperUrlPlaceholder": "https://example.com/wallpaper.jpg",
    "skin.wallpaperUploaded": "Uploaded file: {name}",
    "skin.wallpaperNone": "No custom wallpaper set",
    "skin.rowFitTitle": "Image Fit",
    "skin.rowFitHint": "Control how the background image scales inside the viewport.",
    "skin.fitCover": "Cover",
    "skin.fitContain": "Contain",
    "skin.rowAlphaTitle": "Surface Opacity",
    "skin.rowAlphaHint":
      "Adjust translucency of rails, tabs, panels, and cards over the background image.",
    "skin.rowBlurTitle": "Glass Blur",
    "skin.rowBlurHint": "Backdrop blur radius applied to translucent surfaces.",
    "skin.rowDimTitle": "Background Dimming",
    "skin.rowDimHint": "Veil over the wallpaper to preserve text readability.",
    "skin.rowReadabilityTitle": "Readability Scrim & Borders",
    "skin.rowReadabilityHint":
      "Strengthen frosted reading plates, text contrast, and panel or message borders over the wallpaper.",
    "skin.rowPresetsTitle": "Quick Visual Presets",
    "skin.rowPresetsHint":
      "One-click balance between crisp text readability and vivid wallpaper visibility.",
    "skin.presetClearReading": "Clear Reading",
    "skin.presetVividArtwork": "Vivid Artwork",
    "skin.floatTitle": "Skin & Appearance",
    "skin.floatSkinLabel": "Active Skin",
    "skin.floatBgLabel": "Background",
    "skin.floatOpacityLabel": "Opacity",
    "skin.floatReadabilityLabel": "Clarity",
    "skin.floatBlurLabel": "Blur",
    "skin.floatQuickImport": "Import .zip / .css",
    "skin.customDirHint": "Custom skin folder: {path}",
    "skin.confirmDelete":
      'Delete custom skin "{name}"? This removes its folder from your custom skins directory.',
    "skin.confirmDeleteTitle": "Delete Custom Skin",
    "skin.toastRescanned": "Rescanned skins ({count} available).",
    "skin.toastImported": 'Imported and activated skin "{name}".',
    "skin.toastDeleted": 'Deleted custom skin "{name}".',
    "skin.toastWallpaperUploaded": "Custom wallpaper uploaded.",
    "skin.toastWallpaperCleared": "Custom wallpaper cleared.",
    "skin.toastUrlApplied": "Custom background URL applied.",
    "skin.toastUrlEmpty": "Please enter an image URL first.",
    "skin.toastUnsupportedSkinFile": "Only .zip skin packs and .css files are supported.",
    "skin.toastActionFailed": "Action failed: {message}",
    "skin.loading": "Loading skin configuration...",
    "skin.ownerUnavailable": "Skin service is unavailable ({status}).",
    "skin.metaCommunity": "Community",
    "skin.toastInvalidUrlScheme": "URL must start with https:// or http://",
    "skin.builtin.sakura-washi.name": "Sakura Washi",
    "skin.builtin.sakura-washi.desc":
      "Warm Japanese handmade washi paper with vermilion-sakura crimson, gold-leaf Asanoha geometry, and petal-glow editorial bubbles.",
    "skin.builtin.tsukimi-anime.name": "Moonlit Anime",
    "skin.builtin.tsukimi-anime.desc":
      "Twilight indigo-violet cel-sky moonlight aesthetic with luminous silver-cyan glow, frosted anime HUD glass cards, and starlight dialogue bubbles.",
    "skin.groupIntroTitle": "Boot Intro & Live Wallpaper",
    "skin.groupIntroDesc":
      "Play a one-shot cinematic startup sequence and seamlessly keep its animated scene or loop video as your live workspace wallpaper.",
    "skin.introEnableTitle": "Enable Boot Intro / Live Pack",
    "skin.introEnableHint": "Activate the selected intro cinema and optional persistent live wallpaper.",
    "skin.introStartupTitle": "Play on Startup",
    "skin.introStartupHint": "Automatically play the fullscreen intro once when opening KohakuTerrarium.",
    "skin.introKeepLiveTitle": "Keep as Live Wallpaper",
    "skin.introKeepLiveHint": "Hand off the final artwork or loop video with ambient particles into the background layer.",
    "skin.introMuteTitle": "Mute Intro Audio",
    "skin.introMuteHint": "Keep startup audio muted by default.",
    "skin.introVolumeTitle": "Intro Volume",
    "skin.introVolumeHint": "Playback volume for intro music or built-in starlight synth chords.",
    "skin.introToggleOn": "On",
    "skin.introToggleOff": "Off",
    "skin.introBtnPreview": "Play Preview",
    "skin.introBtnCreate": "Create Custom Intro",
    "skin.introBtnImportZip": "Import .zip Pack",
    "skin.introBtnTemplateZip": "Intro Template (.zip)",
    "skin.introBtnExportZip": "Export .zip",
    "skin.introBtnRescan": "Rescan Intros",
    "skin.introModeSingle": "Single",
    "skin.introModeDirector": "Director",
    "skin.introModeVideo": "Video",
    "skin.introDirHint": "Custom intro folder: {path}",
    "skin.introEmpty": "No intro packs found. Create one or import a .zip pack.",
    "skin.introConfirmDelete":
      'Delete custom intro pack "{name}"? This removes its folder from your custom intros directory.',
    "skin.introConfirmDeleteTitle": "Delete Custom Intro",
    "skin.introToastDeleted": 'Deleted custom intro "{name}".',
    "skin.introToastImported": 'Imported intro pack "{name}".',
    "skin.introToastRescanned": "Rescanned intro packs ({count} available).",
    "skin.toastIntroCreated": 'Created and activated intro "{name}".',
    "skin.introToastNoActive": "Enable or select an intro pack first to preview.",
    "skin.introClickToUnmute": "Click to unmute",
    "skin.introSoundOn": "Sound On",
    "skin.introSoundOff": "Sound Off",
    "skin.introBtnReplay": "Replay",
    "skin.introBtnSkip": "[ESC] Skip",
    "skin.floatIntroLabel": "Boot Intro & Live",
    "skin.floatIntroOff": "Off",
    "skin.floatIntroPreview": "Preview",
    "skin.fxPreset.starlight-cyan": "Starlight Cyan",
    "skin.fxPreset.amber-firefly": "Amber Firefly",
    "skin.fxPreset.sakura-petals": "Sakura Petals",
    "skin.fxPreset.cyber-neon": "Cyber Neon",
    "skin.fxPreset.minimal-clean": "Minimal Clean",
    "skin.workshopTitle": "Create Custom Intro Pack",
    "skin.workshopSubtitle":
      "Zero-code wizard for 1-Image Auto Cinema or MP4/WebM Video intros with live wallpaper support.",
    "skin.workshopModeLabel": "Intro Mode",
    "skin.workshopModeSingle": "1-Image Auto Cinema",
    "skin.workshopModeVideo": "MP4/WebM Video Intro",
    "skin.workshopNameLabel": "Pack Name",
    "skin.workshopNamePlaceholder": "My Starlight Opening",
    "skin.workshopDurationLabel": "Duration (sec)",
    "skin.workshopPresetLabel": "FX Preset",
    "skin.workshopHeroLabel": "Hero Artwork (PNG / JPG / WebP)",
    "skin.workshopFocalHint": "Click image to set climax focal burst point: ({x}%, {y}%)",
    "skin.workshopVideoLabel": "Intro Video (MP4 / WebM)",
    "skin.workshopLoopVideoLabel": "Optional Loop Video (MP4 / WebM)",
    "skin.workshopAudioLabel": "Optional Audio Track (MP3 / WAV / OGG)",
    "skin.workshopUseSynthAudio": "Use built-in Starlight synth chords when no audio file is uploaded",
    "skin.workshopSubtitlesLabel": "Timed Subtitles (optional)",
    "skin.workshopAddSubtitle": "Add Subtitle",
    "skin.workshopSubPrimaryPlaceholder": "Primary subtitle line",
    "skin.workshopSubSecondaryPlaceholder": "Secondary translation line",
    "skin.workshopSubmit": "Create & Preview",
    "skin.workshopSubmitting": "Creating...",
    "skin.workshopErrName": "Please enter a name for the intro pack.",
    "skin.workshopErrHeroImage": "Please select a hero artwork image.",
    "skin.workshopErrVideoFile": "Please select an intro video file.",
  }),
  "zh-CN": Object.freeze({
    "skin.title": "皮肤与外观",
    "skin.groupSkinsTitle": "界面皮肤与自定义皮肤包",
    "skin.groupSkinsDesc":
      "在原生默认界面、内置示例皮肤或导入的社区皮肤包之间自由切换，卸载皮肤后零残留。",
    "skin.groupBgTitle": "背景图片与毛玻璃效果",
    "skin.groupBgDesc":
      "可独立加载自定义背景图片或跟随当前皮肤默认背景，即使未加载皮肤也能单独使用背景层。",
    "skin.defaultName": "原生默认（不加载皮肤）",
    "skin.defaultDesc":
      "恢复 KohakuTerrarium 原生外观，移除所有皮肤样式与变量覆盖。",
    "skin.badgeActive": "当前生效",
    "skin.badgeBuiltin": "内置示例",
    "skin.badgeCustom": "自定义",
    "skin.badgeStock": "原生",
    "skin.btnActivate": "启用",
    "skin.btnActive": "已启用",
    "skin.btnDelete": "删除",
    "skin.btnRescan": "重新扫描皮肤",
    "skin.btnImport": "导入皮肤 (.zip / .css)",
    "skin.btnTemplate": "下载皮肤模板 (.zip)",
    "skin.btnUploadBg": "上传本地图片",
    "skin.btnApplyUrl": "应用链接",
    "skin.btnClearBg": "清除壁纸",
    "skin.btnOpenSettingsShort": "设置",
    "skin.btnClose": "关闭",
    "skin.rowModeTitle": "背景模式",
    "skin.rowModeHint":
      "选择关闭背景图、跟随当前皮肤默认背景或使用自定义背景图片。",
    "skin.modeOff": "不显示背景",
    "skin.modeSkin": "跟随皮肤背景",
    "skin.modeCustom": "自定义图片",
    "skin.rowWallpaperTitle": "自定义图片来源",
    "skin.rowWallpaperHint":
      "上传本地 PNG/JPG/WebP/GIF/SVG 图片，或填写图片 URL。",
    "skin.wallpaperUrlPlaceholder": "https://example.com/wallpaper.jpg",
    "skin.wallpaperUploaded": "已上传文件：{name}",
    "skin.wallpaperNone": "尚未设置自定义壁纸",
    "skin.rowFitTitle": "背景缩放方式",
    "skin.rowFitHint": "控制背景图片在视口中的填充比例。",
    "skin.fitCover": "铺满裁剪 (Cover)",
    "skin.fitContain": "完整显示 (Contain)",
    "skin.rowAlphaTitle": "界面表面不透明度",
    "skin.rowAlphaHint":
      "调节侧栏、标签栏、面板与卡片覆盖在背景图上的半透明程度。",
    "skin.rowBlurTitle": "毛玻璃模糊半径",
    "skin.rowBlurHint": "作用于半透明界面的背景模糊强度。",
    "skin.rowDimTitle": "背景遮罩雾化",
    "skin.rowDimHint": "在背景图上方叠加自适应柔光/暗色遮罩以保证文字清晰可读。",
    "skin.rowReadabilityTitle": "阅读衬底与边框增强",
    "skin.rowReadabilityHint":
      "增强背景图上的会话阅读衬底、文字对比度及面板、卡片与工具块边框清晰度。",
    "skin.rowPresetsTitle": "快捷视觉预设",
    "skin.rowPresetsHint": "一键平衡文字阅读清晰度与背景壁纸通透感。",
    "skin.presetClearReading": "清晰阅读",
    "skin.presetVividArtwork": "通透赏图",
    "skin.floatTitle": "皮肤与外观",
    "skin.floatSkinLabel": "当前皮肤",
    "skin.floatBgLabel": "背景图片",
    "skin.floatOpacityLabel": "不透明度",
    "skin.floatReadabilityLabel": "清晰度",
    "skin.floatBlurLabel": "模糊",
    "skin.floatQuickImport": "导入 .zip / .css",
    "skin.customDirHint": "自定义皮肤目录：{path}",
    "skin.confirmDelete":
      "确定删除自定义皮肤“{name}”吗？这将从自定义皮肤目录移除该文件夹。",
    "skin.confirmDeleteTitle": "删除自定义皮肤",
    "skin.toastRescanned": "已重新扫描皮肤（共 {count} 个可用）。",
    "skin.toastImported": "已导入并启用皮肤“{name}”。",
    "skin.toastDeleted": "已删除自定义皮肤“{name}”。",
    "skin.toastWallpaperUploaded": "自定义背景图片已上传。",
    "skin.toastWallpaperCleared": "自定义背景图片已清除。",
    "skin.toastUrlApplied": "自定义背景链接已应用。",
    "skin.toastUrlEmpty": "请先输入图片链接。",
    "skin.toastUnsupportedSkinFile":
      "仅支持导入 .zip 皮肤包或单文件 .css 皮肤。",
    "skin.toastActionFailed": "操作失败：{message}",
    "skin.loading": "正在加载皮肤配置...",
    "skin.ownerUnavailable": "皮肤后端服务不可用（{status}）。",
    "skin.metaCommunity": "社区",
    "skin.toastInvalidUrlScheme": "图片链接必须以 https:// 或 http:// 开头",
    "skin.builtin.sakura-washi.name": "和纸绯樱",
    "skin.builtin.sakura-washi.desc":
      "温润手作奉书和纸质感，融合绯樱朱砂、麻叶金箔纹样与花瓣柔光对话气泡。",
    "skin.builtin.tsukimi-anime.name": "月咏星穹",
    "skin.builtin.tsukimi-anime.desc":
      "暮色靛紫二次元弦月夜空美学，搭配银青流光、磨砂星轨 HUD 玻璃卡片与星光对话气泡。",
    "skin.groupIntroTitle": "开场演出与动态壁纸",
    "skin.groupIntroDesc":
      "启动时播放一镜到底全屏开场演出，结束后无缝接力为低功耗常驻动态壁纸或循环视频。",
    "skin.introEnableTitle": "启用开场演出 / 动态壁纸包",
    "skin.introEnableHint": "开启当前选中的开场演出与常驻动态壁纸能力。",
    "skin.introStartupTitle": "启动自动播放开场",
    "skin.introStartupHint": "每次打开 KohakuTerrarium 时自动播放一次全屏开场演出。",
    "skin.introKeepLiveTitle": "结束后保留为常驻动态壁纸",
    "skin.introKeepLiveHint": "将终帧立绘+微光粒子或循环视频保留为工作区背景层。",
    "skin.introMuteTitle": "开场静音",
    "skin.introMuteHint": "默认静音播放开场音频。",
    "skin.introVolumeTitle": "开场音量",
    "skin.introVolumeHint": "调节开场音轨或内置星穹合成和弦的播放音量。",
    "skin.introToggleOn": "已开启",
    "skin.introToggleOff": "已关闭",
    "skin.introBtnPreview": "全屏预览重播",
    "skin.introBtnCreate": "零代码新建开场",
    "skin.introBtnImportZip": "导入演出包 (.zip)",
    "skin.introBtnTemplateZip": "下载开场模板 (.zip)",
    "skin.introBtnExportZip": "导出 .zip",
    "skin.introBtnRescan": "重新扫描",
    "skin.introModeSingle": "单图大片",
    "skin.introModeDirector": "导演分层",
    "skin.introModeVideo": "视频直通",
    "skin.introDirHint": "自定义开场包目录：{path}",
    "skin.introEmpty": "暂未发现开场演出包，可新建或导入 .zip 演出包。",
    "skin.introConfirmDelete":
      "确定删除自定义开场包“{name}”吗？这将移除其目录下的全部资源文件。",
    "skin.introConfirmDeleteTitle": "删除自定义开场包",
    "skin.introToastDeleted": "已删除自定义开场包“{name}”。",
    "skin.introToastImported": "已导入开场演出包“{name}”。",
    "skin.introToastRescanned": "已重新扫描开场包（共 {count} 个可用）。",
    "skin.toastIntroCreated": "已创建并启用开场包“{name}”。",
    "skin.introToastNoActive": "请先启用或选择一个开场包再预览。",
    "skin.introClickToUnmute": "点击开启声音",
    "skin.introSoundOn": "声音已开",
    "skin.introSoundOff": "已静音",
    "skin.introBtnReplay": "重播",
    "skin.introBtnSkip": "[ESC] 跳过",
    "skin.floatIntroLabel": "开场演出与动态壁纸",
    "skin.floatIntroOff": "关闭",
    "skin.floatIntroPreview": "预览重播",
    "skin.fxPreset.starlight-cyan": "星穹青光",
    "skin.fxPreset.amber-firefly": "琥珀流萤",
    "skin.fxPreset.sakura-petals": "绯樱落瓣",
    "skin.fxPreset.cyber-neon": "赛博霓虹",
    "skin.fxPreset.minimal-clean": "极简纯净",
    "skin.workshopTitle": "零代码新建开场演出包",
    "skin.workshopSubtitle":
      "上传单张立绘即可自动生成三段光效大片，或导入 MP4/WebM 视频并配字幕与循环动态壁纸。",
    "skin.workshopModeLabel": "演出模式",
    "skin.workshopModeSingle": "单图自动大片",
    "skin.workshopModeVideo": "MP4/WebM 视频直通",
    "skin.workshopNameLabel": "演出包名称",
    "skin.workshopNamePlaceholder": "我的星穹开场",
    "skin.workshopDurationLabel": "演出时长（秒）",
    "skin.workshopPresetLabel": "粒子光效预设",
    "skin.workshopHeroLabel": "单张立绘图片 (PNG / JPG / WebP)",
    "skin.workshopFocalHint": "点击画面拾取高潮星芒爆发坐标：({x}%, {y}%)",
    "skin.workshopVideoLabel": "开场视频文件 (MP4 / WebM)",
    "skin.workshopLoopVideoLabel": "可选常驻循环视频 (MP4 / WebM)",
    "skin.workshopAudioLabel": "可选音频文件 (MP3 / WAV / OGG)",
    "skin.workshopUseSynthAudio": "未上传音频时使用内置星穹合成和弦",
    "skin.workshopSubtitlesLabel": "定时双语字幕（可选）",
    "skin.workshopAddSubtitle": "添加字幕行",
    "skin.workshopSubPrimaryPlaceholder": "主字幕文案",
    "skin.workshopSubSecondaryPlaceholder": "副字幕 / 译文",
    "skin.workshopSubmit": "创建并立即预览",
    "skin.workshopSubmitting": "正在创建...",
    "skin.workshopErrName": "请先填写演出包名称。",
    "skin.workshopErrHeroImage": "请先上传单张立绘图片。",
    "skin.workshopErrVideoFile": "请先选择开场视频文件。",
  }),
  "zh-TW": Object.freeze({
    "skin.title": "外觀與皮膚",
    "skin.groupSkinsTitle": "介面皮膚與自訂皮膚包",
    "skin.groupSkinsDesc":
      "在原生預設介面、內建範例皮膚或匯入的社群皮膚包之間自由切換，卸載皮膚後零殘留。",
    "skin.groupBgTitle": "背景圖片與毛玻璃效果",
    "skin.groupBgDesc":
      "可獨立載入自訂背景圖片或跟隨目前皮膚預設背景，即使未載入皮膚也能單獨使用背景層。",
    "skin.defaultName": "原生預設（不載入皮膚）",
    "skin.defaultDesc":
      "恢復 KohakuTerrarium 原生外觀，移除所有皮膚樣式與變數覆蓋。",
    "skin.badgeActive": "目前生效",
    "skin.badgeBuiltin": "內建範例",
    "skin.badgeCustom": "自訂",
    "skin.badgeStock": "原生",
    "skin.btnActivate": "啟用",
    "skin.btnActive": "已啟用",
    "skin.btnDelete": "刪除",
    "skin.btnRescan": "重新掃描皮膚",
    "skin.btnImport": "匯入皮膚 (.zip / .css)",
    "skin.btnTemplate": "下載皮膚範本 (.zip)",
    "skin.btnUploadBg": "上傳本機圖片",
    "skin.btnApplyUrl": "套用連結",
    "skin.btnClearBg": "清除桌布",
    "skin.btnOpenSettingsShort": "設定",
    "skin.btnClose": "關閉",
    "skin.rowModeTitle": "背景模式",
    "skin.rowModeHint":
      "選擇關閉背景圖、跟隨目前皮膚預設背景或使用自訂背景圖片。",
    "skin.modeOff": "不顯示背景",
    "skin.modeSkin": "跟隨皮膚背景",
    "skin.modeCustom": "自訂圖片",
    "skin.rowWallpaperTitle": "自訂圖片來源",
    "skin.rowWallpaperHint":
      "上傳本機 PNG/JPG/WebP/GIF/SVG 圖片，或填寫圖片 URL。",
    "skin.wallpaperUrlPlaceholder": "https://example.com/wallpaper.jpg",
    "skin.wallpaperUploaded": "已上傳檔案：{name}",
    "skin.wallpaperNone": "尚未設定自訂桌布",
    "skin.rowFitTitle": "背景縮放方式",
    "skin.rowFitHint": "控制背景圖片在視窗中的填滿比例。",
    "skin.fitCover": "填滿裁切 (Cover)",
    "skin.fitContain": "完整顯示 (Contain)",
    "skin.rowAlphaTitle": "介面表面不透明度",
    "skin.rowAlphaHint":
      "調整側欄、分頁列、面板與卡片覆蓋在背景圖上的半透明程度。",
    "skin.rowBlurTitle": "毛玻璃模糊半徑",
    "skin.rowBlurHint": "套用於半透明介面的背景模糊強度。",
    "skin.rowDimTitle": "背景遮罩霧化",
    "skin.rowDimHint": "在背景圖上方疊加自適應柔光/暗色遮罩以維持文字清晰可讀。",
    "skin.rowReadabilityTitle": "閱讀襯底與邊框增強",
    "skin.rowReadabilityHint":
      "增強背景圖上的會話閱讀襯底、文字對比度及面板、卡片與工具區塊邊框清晰度。",
    "skin.rowPresetsTitle": "快捷視覺預設",
    "skin.rowPresetsHint": "一鍵平衡文字閱讀清晰度與背景桌布通透感。",
    "skin.presetClearReading": "清晰閱讀",
    "skin.presetVividArtwork": "通透賞圖",
    "skin.floatTitle": "外觀與皮膚",
    "skin.floatSkinLabel": "目前皮膚",
    "skin.floatBgLabel": "背景圖片",
    "skin.floatOpacityLabel": "不透明度",
    "skin.floatReadabilityLabel": "清晰度",
    "skin.floatBlurLabel": "模糊",
    "skin.floatQuickImport": "匯入 .zip / .css",
    "skin.customDirHint": "自訂皮膚目錄：{path}",
    "skin.confirmDelete":
      "確定要刪除自訂皮膚「{name}」嗎？這將從自訂皮膚目錄移除該資料夾。",
    "skin.confirmDeleteTitle": "刪除自訂皮膚",
    "skin.toastRescanned": "已重新掃描皮膚（共 {count} 個可用）。",
    "skin.toastImported": "已匯入並啟用皮膚「{name}」。",
    "skin.toastDeleted": "已刪除自訂皮膚「{name}」。",
    "skin.toastWallpaperUploaded": "自訂背景圖片已上傳。",
    "skin.toastWallpaperCleared": "自訂背景圖片已清除。",
    "skin.toastUrlApplied": "自訂背景連結已套用。",
    "skin.toastUrlEmpty": "請先輸入圖片連結。",
    "skin.toastUnsupportedSkinFile":
      "僅支援匯入 .zip 皮膚包或單檔 .css 皮膚。",
    "skin.toastActionFailed": "操作失敗：{message}",
    "skin.loading": "正在載入皮膚設定...",
    "skin.ownerUnavailable": "皮膚後端服務無法使用（{status}）。",
    "skin.metaCommunity": "社群",
    "skin.toastInvalidUrlScheme": "圖片連結必須以 https:// 或 http:// 開頭",
    "skin.builtin.sakura-washi.name": "和紙緋櫻",
    "skin.builtin.sakura-washi.desc":
      "溫潤手作奉書和紙質感，融合緋櫻朱砂、麻葉金箔紋樣與花瓣柔光對話氣泡。",
    "skin.builtin.tsukimi-anime.name": "月詠星穹",
    "skin.builtin.tsukimi-anime.desc":
      "暮色靛紫二次元弦月夜空美學，搭配銀青流光、磨砂星軌 HUD 玻璃卡片與星光對話氣泡。",
    "skin.groupIntroTitle": "開場演出與動態桌布",
    "skin.groupIntroDesc":
      "啟動時播放一鏡到底全螢幕開場演出，結束後無縫接力為低功耗常駐動態桌布或循環影片。",
    "skin.introEnableTitle": "啟用開場演出 / 動態桌布包",
    "skin.introEnableHint": "開啟目前選取的開場演出與常駐動態桌布功能。",
    "skin.introStartupTitle": "啟動自動播放開場",
    "skin.introStartupHint": "每次開啟 KohakuTerrarium 時自動播放一次全螢幕開場演出。",
    "skin.introKeepLiveTitle": "結束後保留為常駐動態桌布",
    "skin.introKeepLiveHint": "將終幀立繪+微光粒子或循環影片保留為工作區背景層。",
    "skin.introMuteTitle": "開場靜音",
    "skin.introMuteHint": "預設靜音播放開場音訊。",
    "skin.introVolumeTitle": "開場音量",
    "skin.introVolumeHint": "調整開場音軌或內建星穹合成和弦的播放音量。",
    "skin.introToggleOn": "已開啟",
    "skin.introToggleOff": "已關閉",
    "skin.introBtnPreview": "全螢幕預覽重播",
    "skin.introBtnCreate": "零程式碼新建開場",
    "skin.introBtnImportZip": "匯入演出包 (.zip)",
    "skin.introBtnTemplateZip": "下載開場範本 (.zip)",
    "skin.introBtnExportZip": "匯出 .zip",
    "skin.introBtnRescan": "重新掃描",
    "skin.introModeSingle": "單圖大片",
    "skin.introModeDirector": "導演分層",
    "skin.introModeVideo": "影片直通",
    "skin.introDirHint": "自訂開場包目錄：{path}",
    "skin.introEmpty": "暫未發現開場演出包，可新建或匯入 .zip 演出包。",
    "skin.introConfirmDelete":
      "確定要刪除自訂開場包「{name}」嗎？這將移除其目錄下的全部資源檔案。",
    "skin.introConfirmDeleteTitle": "刪除自訂開場包",
    "skin.introToastDeleted": "已刪除自訂開場包「{name}」。",
    "skin.introToastImported": "已匯入開場演出包「{name}」。",
    "skin.introToastRescanned": "已重新掃描開場包（共 {count} 個可用）。",
    "skin.toastIntroCreated": "已建立並啟用開場包「{name}」。",
    "skin.introToastNoActive": "請先啟用或選擇一個開場包再預覽。",
    "skin.introClickToUnmute": "點擊開啟聲音",
    "skin.introSoundOn": "聲音已開",
    "skin.introSoundOff": "已靜音",
    "skin.introBtnReplay": "重播",
    "skin.introBtnSkip": "[ESC] 略過",
    "skin.floatIntroLabel": "開場演出與動態桌布",
    "skin.floatIntroOff": "關閉",
    "skin.floatIntroPreview": "預覽重播",
    "skin.fxPreset.starlight-cyan": "星穹青光",
    "skin.fxPreset.amber-firefly": "琥珀流螢",
    "skin.fxPreset.sakura-petals": "緋櫻落瓣",
    "skin.fxPreset.cyber-neon": "賽博霓虹",
    "skin.fxPreset.minimal-clean": "極簡純淨",
    "skin.workshopTitle": "零程式碼新建開場演出包",
    "skin.workshopSubtitle":
      "上傳單張立繪即可自動產生三段光效大片，或匯入 MP4/WebM 影片並配字幕與循環動態桌布。",
    "skin.workshopModeLabel": "演出模式",
    "skin.workshopModeSingle": "單圖自動大片",
    "skin.workshopModeVideo": "MP4/WebM 影片直通",
    "skin.workshopNameLabel": "演出包名稱",
    "skin.workshopNamePlaceholder": "我的星穹開場",
    "skin.workshopDurationLabel": "演出時長（秒）",
    "skin.workshopPresetLabel": "粒子光效預設",
    "skin.workshopHeroLabel": "單張立繪圖片 (PNG / JPG / WebP)",
    "skin.workshopFocalHint": "點擊畫面拾取高潮星芒爆發座標：({x}%, {y}%)",
    "skin.workshopVideoLabel": "開場影片檔案 (MP4 / WebM)",
    "skin.workshopLoopVideoLabel": "選填常駐循環影片 (MP4 / WebM)",
    "skin.workshopAudioLabel": "選填音訊檔案 (MP3 / WAV / OGG)",
    "skin.workshopUseSynthAudio": "未上傳音訊時使用內建星穹合成和弦",
    "skin.workshopSubtitlesLabel": "定時雙語字幕（選填）",
    "skin.workshopAddSubtitle": "新增字幕列",
    "skin.workshopSubPrimaryPlaceholder": "主字幕文案",
    "skin.workshopSubSecondaryPlaceholder": "副字幕 / 譯文",
    "skin.workshopSubmit": "建立並立即預覽",
    "skin.workshopSubmitting": "正在建立...",
    "skin.workshopErrName": "請先填寫演出包名稱。",
    "skin.workshopErrHeroImage": "請先上傳單張立繪圖片。",
    "skin.workshopErrVideoFile": "請先選擇開場影片檔案。",
  }),
})

const SETTINGS_NAV_SELECTOR = '[data-section="ext:kohaku-skin/preferences"]'
const SETTINGS_ROOT_SELECTOR = '[data-test="ks-settings-root"]'

/**
 * Map any host locale string to one of our bundled locale keys ("en", "zh-CN", "zh-TW").
 */
export function normalizeSkinLocale(rawLocale) {
  if (typeof rawLocale !== "string") return "en"
  const lower = rawLocale.trim().toLowerCase().replace(/_/g, "-")
  if (
    lower === "zh-tw" ||
    lower === "zh-hk" ||
    lower === "zh-mo" ||
    lower.startsWith("zh-hant")
  ) {
    return "zh-TW"
  }
  if (lower === "zh" || lower.startsWith("zh-")) {
    return "zh-CN"
  }
  return "en"
}

/**
 * Translate a key using the bundled locale dictionaries and interpolate {name} placeholders.
 */
export function translateSkinText(rawLocale, key, params) {
  const localeKey = normalizeSkinLocale(rawLocale)
  const bundle = BUNDLES[localeKey]
  const raw =
    bundle && Object.prototype.hasOwnProperty.call(bundle, key)
      ? bundle[key]
      : Object.prototype.hasOwnProperty.call(BUNDLES.en, key)
        ? BUNDLES.en[key]
        : key
  const values = params && typeof params === "object" ? params : {}
  return String(raw).replace(/\{(\w+)\}/g, (_match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : `{${name}}`,
  )
}

/**
 * Resolve localized display name for a built-in skin, or preserve custom skin names verbatim.
 */
export function resolveSkinName(rawLocale, skin) {
  if (!skin || typeof skin !== "object") return ""
  if (skin.source === "builtin" && typeof skin.id === "string" && skin.id) {
    const key = `skin.builtin.${skin.id}.name`
    if (Object.prototype.hasOwnProperty.call(BUNDLES.en, key)) {
      return translateSkinText(rawLocale, key, {})
    }
  }
  if (typeof skin.name === "string" && skin.name.trim()) return skin.name
  if (typeof skin.id === "string") return skin.id
  return ""
}

/**
 * Resolve localized description for a built-in skin, or preserve custom descriptions verbatim.
 */
export function resolveSkinDescription(rawLocale, skin) {
  if (!skin || typeof skin !== "object") return ""
  if (skin.source === "builtin" && typeof skin.id === "string" && skin.id) {
    const key = `skin.builtin.${skin.id}.desc`
    if (Object.prototype.hasOwnProperty.call(BUNDLES.en, key)) {
      return translateSkinText(rawLocale, key, {})
    }
  }
  if (typeof skin.description === "string" && skin.description.trim()) return skin.description
  if (typeof skin.id === "string") return skin.id
  return ""
}

/**
 * Synchronize static host Settings navigation and SectionShell heading labels
 * to the active localized title without disturbing icons, badges, or triggering loops.
 */
export function syncSettingsHostLabels(doc, localizedTitle) {
  if (!doc || typeof localizedTitle !== "string" || !localizedTitle) return

  if (typeof doc.querySelectorAll === "function") {
    const navButtons = doc.querySelectorAll(SETTINGS_NAV_SELECTOR)
    for (const btn of navButtons) {
      let labelEl = null
      if (typeof btn.querySelector === "function") {
        labelEl = btn.querySelector("span.flex-1")
      }
      if (labelEl) {
        if (labelEl.textContent !== localizedTitle) {
          labelEl.textContent = localizedTitle
        }
      } else if (!btn.children || btn.children.length === 0) {
        if (btn.textContent !== localizedTitle) {
          btn.textContent = localizedTitle
        }
      }
    }
  }

  if (typeof doc.querySelector === "function") {
    const settingsRoot = doc.querySelector(SETTINGS_ROOT_SELECTOR)
    if (settingsRoot && typeof settingsRoot.closest === "function") {
      const sectionEl = settingsRoot.closest("section")
      if (sectionEl && typeof sectionEl.querySelector === "function") {
        const headingEl = sectionEl.querySelector("header h2")
        if (headingEl && headingEl.textContent !== localizedTitle) {
          headingEl.textContent = localizedTitle
        }
      }
    }
  }
}
