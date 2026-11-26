# kohaku-skin

An open, extensible **UI Skin & Background Engine** extension for [KohakuTerrarium](https://github.com/Kohaku-Lab/KohakuTerrarium).

`kohaku-skin` does not lock you into hardcoded themes. It exposes a clean CSS semantic token bridge (`--ks-*`), an independent translucent background/wallpaper layer, a Settings manager, native Session Floating Dock (`浮动面板`) integration, and a community-friendly custom skin pack format (`.zip`, folder, or single-file `.css`).

## Features

- **Clean Load & Unload**: Switch to **Default (No Skin Loaded)** at any time to restore 100% stock KohakuTerrarium with zero CSS or DOM residue.
- **Independent Background Layer**: Load a custom wallpaper (local file upload or image URL) or follow the active skin's default background, with live controls for **Surface Opacity**, **Glass Blur**, **Background Dimming**, and **Image Fit** (`cover` / `contain`). Works even when no UI skin is active.
- **Dual Control Surfaces**:
  - **Settings → Skin & Appearance**: Browse skins, import `.zip`/`.css` packs, download the starter template, rescan, upload wallpapers, and fine-tune glass sliders.
  - **Session Floating Dock (`浮动面板`) & `Ctrl+Alt+S`**: Adds a standalone icon button directly inside KohakuTerrarium's built-in session dock to open a clean pure-text skin & background popover anchored right above the dock (or toggle it anywhere with `Ctrl+Alt+S`).
- **Two Reference Skins Bundled**:
  - `sakura-washi` (`和纸绯樱 · Sakura Washi`) — Warm Japanese handmade washi paper with vermilion-sakura crimson, gold-leaf Asanoha geometry, and petal-glow editorial bubbles.
  - `tsukimi-anime` (`月咏星穹 · Moonlit Anime`) — Twilight indigo-violet cel-sky moonlight aesthetic with luminous silver-cyan glow, frosted anime HUD glass cards, and chamfered dialogue bubbles.

## Installation

Install in editable mode for local development:

```bash
kt install . -e
```

Restart or reload KohakuTerrarium. Open **Settings → Skin & Appearance**, click the skin icon in the Session Floating Dock (`浮动面板`), or press **`Ctrl+Alt+S`** to toggle the quick skin panel.

## Custom Skin Authoring Guide

Community skins live in `<config_dir>/kohaku-skin/skins/<skin-id>/` (or can be imported directly via **Import Skin (.zip / .css)** in Settings or the Session Floating Dock panel). You can also click **Starter Template (.zip)** in Settings to download a ready-to-edit pack.

### Option A — Full Skin Pack (Folder or `.zip`)

```text
my-skin/
├── skin.json
├── theme.css
└── assets/
    └── bg-custom.webp
```

#### `skin.json` Schema

```json
{
  "id": "my-skin",
  "name": "My Custom Skin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Short summary shown in Settings.",
  "color_mode": "auto",
  "entry_css": "theme.css",
  "default_background": "assets/bg-custom.webp",
  "tokens": {
    "--ks-accent": "#f59e0b",
    "--ks-accent-secondary": "#14b8a6",
    "--ks-radius": "0.75rem"
  }
}
```

- `color_mode`: `"auto"`, `"light"`, or `"dark"`. For `"auto"` skins, put mode-invariant tokens (`--ks-accent`, `--ks-radius`, fonts) in `skin.json` `tokens` and mode-specific surface colors in `theme.css` under `html[data-ks-skin="my-skin"]` and `html.dark[data-ks-skin="my-skin"]`.
- **Relative Asset URLs**: Inside `theme.css`, write normal relative references such as `url("./assets/pattern.svg")` or `url("assets/font.woff2")`. The runtime automatically rewrites them to `/api/ext/kohaku-skin/skins/<skin-id>/assets/...`.

### Option B — Single-File `.css` Skin

Drop or import a single `.css` file (for example `neon-midnight.css`) defining `--ks-*` variables and optional custom selectors on `html[data-ks-active="true"]` or `html[data-ks-skin="neon-midnight"]`. `kohaku-skin` wraps it into a custom skin pack automatically.

### Semantic `--ks-*` Token Reference

Setting these tokens automatically skins KohakuTerrarium's shell rail, tab strip, v2 surfaces, Element Plus widgets, chat composer, and conversation bubbles:

| Token | Role |
|---|---|
| `--ks-bg` | Main page / canvas background |
| `--ks-surface` | Primary elevated surface |
| `--ks-surface-alt` | Secondary / subtle fill surface |
| `--ks-chrome` | Top tab strip and session chrome bar |
| `--ks-panel` | Side rail and dock panels |
| `--ks-card` | Cards and grouped containers |
| `--ks-float` | Floating popovers, menus, dialogs |
| `--ks-text` | Primary text color |
| `--ks-text-muted` | Secondary / muted text |
| `--ks-text-faint` | Placeholders and subtle captions |
| `--ks-border` | Standard hairline border |
| `--ks-border-strong` | Emphasized region border |
| `--ks-accent` | Primary accent (buttons, active indicators, focus rings) |
| `--ks-accent-secondary` | Secondary accent (file actions, success/info highlights) |
| `--ks-user-bubble` | User chat message bubble background |
| `--ks-radius` | Corner radius for cards, bubbles, and composer |
| `--ks-font-sans` | UI and body font stack |
| `--ks-font-mono` | Code and monospace font stack |
| `--ks-surface-alpha` | Translucent surface opacity (`0.20`–`1.00`, controlled by UI) |
| `--ks-backdrop-blur` | Glass backdrop blur radius (`0px`–`32px`, controlled by UI) |
| `--ks-bg-dim` | Background dimming veil (`0.00`–`0.85`, controlled by UI) |
| `--ks-readability` | Frosted reading plate and session border contrast strength (`0.00`–`1.00`, controlled by UI) |

## License

Released under the [MIT License](LICENSE). Built as an extension package for [KohakuTerrarium](https://github.com/Kohaku-Lab/KohakuTerrarium).
