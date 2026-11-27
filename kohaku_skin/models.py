"""Validated skin and preference models and their owner wire representation."""

import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from types import MappingProxyType
from typing import Literal, TypedDict, TypeVar, cast
from urllib.parse import urlsplit

from kohakuterrarium.modules.ui_owner import OwnerArgumentError

SkinSource = Literal["builtin", "custom"]
ColorMode = Literal["auto", "light", "dark"]
BackgroundMode = Literal["off", "skin", "custom"]
BackgroundFit = Literal["cover", "contain"]
T = TypeVar("T", bound=str)

_ID_PATTERN = re.compile(r"[a-z0-9][a-z0-9._-]{0,63}")
_UNSAFE_PATH = re.compile(r'[\\:<>"|?*\x00-\x1f]')
_WINDOWS_DEVICE_NAMES = frozenset({"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"}) | frozenset(
    f"{prefix}{suffix}" for prefix in ("COM", "LPT") for suffix in "123456789¹²³"
)


class SkinManifestState(TypedDict):
    id: str
    name: str
    version: str
    author: str
    description: str
    source: SkinSource
    color_mode: ColorMode
    entry_css: str
    default_background: str
    tokens: dict[str, str]


class ActiveSkinState(TypedDict):
    id: str
    name: str
    css_text: str
    tokens: dict[str, str]
    default_background: str


class BackgroundState(TypedDict):
    mode: BackgroundMode
    custom_url: str
    uploaded_file: str
    fit: BackgroundFit
    dim: float
    blur: int
    surface_alpha: float
    readability_scrim: float


IntroMode = Literal["single", "director", "video"]
_INTRO_MODES: tuple[IntroMode, ...] = ("single", "director", "video")
FxPreset = Literal["starlight-cyan", "amber-firefly", "sakura-petals", "cyber-neon", "minimal-clean"]
RevealMode = Literal["radial", "fade", "wipe"]


class IntroLayerState(TypedDict):
    src: str
    in_sec: float
    in_dur: float
    out_sec: float
    out_dur: float
    reveal: RevealMode
    origin: list[float]


class IntroBurstState(TypedDict):
    start_sec: float
    end_sec: float
    from_point: list[float]
    to_point: list[float]
    scale: float
    intensity: float
    anamorphic: float


class IntroSubtitleState(TypedDict):
    in_sec: float
    out_sec: float
    primary: str
    secondary: str


class IntroManifestState(TypedDict):
    id: str
    name: str
    version: str
    author: str
    description: str
    source: SkinSource
    mode: IntroMode
    duration: float
    outro_start: float
    audio: str
    video: str
    loop_video: str
    auto_stages_image: str
    fx_preset: FxPreset
    focal_point: list[float]
    secondary_point: list[float]
    layers: list[IntroLayerState]
    bursts: list[IntroBurstState]
    subtitles: list[IntroSubtitleState]


class IntroPreferencesState(TypedDict):
    enabled: bool
    active_intro_id: str | None
    play_on_startup: bool
    keep_live_wallpaper: bool
    volume: float
    muted: bool


class PreferencesState(TypedDict):
    skin_enabled: bool
    active_skin_id: str | None
    background: BackgroundState
    intro: IntroPreferencesState


class OwnerState(TypedDict):
    preferences: PreferencesState
    skins: list[SkinManifestState]
    active_skin_payload: ActiveSkinState | None
    custom_skins_rel_hint: str
    intros: list[IntroManifestState]
    active_intro_payload: IntroManifestState | None
    custom_intros_rel_hint: str


@dataclass(frozen=True, slots=True)
class SkinManifest:
    id: str
    name: str
    version: str
    author: str
    description: str
    source: SkinSource
    color_mode: ColorMode
    entry_css: str
    default_background: str
    tokens: Mapping[str, str]

    def to_state(self) -> SkinManifestState:
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "author": self.author,
            "description": self.description,
            "source": self.source,
            "color_mode": self.color_mode,
            "entry_css": self.entry_css,
            "default_background": self.default_background,
            "tokens": dict(self.tokens),
        }


@dataclass(frozen=True, slots=True)
class ActiveSkinPayload:
    id: str
    name: str
    css_text: str
    tokens: Mapping[str, str]
    default_background: str

    def to_state(self) -> ActiveSkinState:
        return {
            "id": self.id,
            "name": self.name,
            "css_text": self.css_text,
            "tokens": dict(self.tokens),
            "default_background": self.default_background,
        }


@dataclass(frozen=True, slots=True)
class BackgroundSettings:
    mode: BackgroundMode
    custom_url: str
    uploaded_file: str
    fit: BackgroundFit
    dim: float
    blur: int
    surface_alpha: float
    readability_scrim: float

    def to_state(self) -> BackgroundState:
        return {
            "mode": self.mode,
            "custom_url": self.custom_url,
            "uploaded_file": self.uploaded_file,
            "fit": self.fit,
            "dim": self.dim,
            "blur": self.blur,
            "surface_alpha": self.surface_alpha,
            "readability_scrim": self.readability_scrim,
        }


@dataclass(frozen=True, slots=True)
class IntroPreferences:
    enabled: bool
    active_intro_id: str | None
    play_on_startup: bool
    keep_live_wallpaper: bool
    volume: float
    muted: bool

    def to_state(self) -> IntroPreferencesState:
        return cast(IntroPreferencesState, asdict(self))


DEFAULT_INTRO_PREFERENCES = IntroPreferences(False, "kohaku-starlight", True, True, 0.85, False)


@dataclass(frozen=True, slots=True)
class UserSkinPreferences:
    skin_enabled: bool
    active_skin_id: str | None
    background: BackgroundSettings
    intro: IntroPreferences = DEFAULT_INTRO_PREFERENCES

    def to_state(self) -> PreferencesState:
        return {
            "skin_enabled": self.skin_enabled,
            "active_skin_id": self.active_skin_id,
            "background": self.background.to_state(),
            "intro": self.intro.to_state(),
        }


DEFAULT_PREFERENCES = UserSkinPreferences(
    skin_enabled=False,
    active_skin_id=None,
    background=BackgroundSettings("skin", "", "", "cover", 0.24, 14, 0.76, readability_scrim=0.55),
)


def object_fields(value: object, field: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise OwnerArgumentError(f"{field} must be a JSON object")
    return value


def require_fields(fields: Mapping[str, object], allowed: tuple[str, ...]) -> None:
    unknown = fields.keys() - set(allowed)
    if unknown:
        raise OwnerArgumentError(f"Unknown argument(s): {', '.join(sorted(unknown))}")


def require_string(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise OwnerArgumentError(f"{field} must be a string")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise OwnerArgumentError(f"{field} must contain valid Unicode") from exc
    return value


def require_bool(value: object, field: str) -> bool:
    if not isinstance(value, bool):
        raise OwnerArgumentError(f"{field} must be true or false")
    return value


def require_choice(value: object, choices: tuple[T, ...], field: str) -> T:
    for choice in choices:
        if isinstance(value, str) and value == choice:
            return choice
    raise OwnerArgumentError(f"{field} must be one of: {', '.join(choices)}")


def require_skin_id(value: object, field: str) -> str:
    if not isinstance(value, str) or not _ID_PATTERN.fullmatch(value):
        raise OwnerArgumentError(f"{field} must match ^[a-z0-9][a-z0-9._-]{{0,63}}$")
    return value


def nullable_skin_id(value: object, field: str) -> str | None:
    return None if value is None else require_skin_id(value, field)


def relative_path(value: object, field: str) -> str:
    path = require_string(value, field)
    if _UNSAFE_PATH.search(path) or any(
        not part or part in (".", "..") or part.endswith((" ", "."))
        or part.partition(".")[0].rstrip().upper() in _WINDOWS_DEVICE_NAMES
        for part in path.split("/")
    ):
        raise OwnerArgumentError(f"{field} must be a safe relative path using '/' separators")
    return path


def filename(value: object, field: str) -> str:
    path = relative_path(value, field)
    if "/" in path:
        raise OwnerArgumentError(f"{field} must be a file name without directories")
    return path


def parse_manifest(value: object, source: SkinSource) -> SkinManifest:
    data = object_fields(value, "skin.json")
    name = require_string(data.get("name"), "name").strip()
    if not name:
        raise OwnerArgumentError("name must not be empty")
    entry_css = relative_path(data.get("entry_css", "theme.css"), "entry_css")
    if not entry_css.lower().endswith(".css"):
        raise OwnerArgumentError("entry_css must point to a .css file")
    default_background = require_string(data.get("default_background", ""), "default_background")
    if default_background:
        relative_path(default_background, "default_background")
    tokens: dict[str, str] = {}
    for key, item in object_fields(data.get("tokens", {}), "tokens").items():
        if not key.startswith("--") or len(key) == 2:
            raise OwnerArgumentError("tokens keys must be CSS custom properties starting with '--'")
        tokens[require_string(key, "token name")] = require_string(item, f"tokens.{key}")
    return SkinManifest(
        id=require_skin_id(data.get("id"), "id"),
        name=name,
        version=require_string(data.get("version", "1.0.0"), "version"),
        author=require_string(data.get("author", ""), "author"),
        description=require_string(data.get("description", ""), "description"),
        source=source,
        color_mode=require_choice(data.get("color_mode", "auto"), ("auto", "light", "dark"), "color_mode"),
        entry_css=entry_css,
        default_background=default_background,
        tokens=MappingProxyType(tokens),
    )


def _background_url(value: object) -> str:
    url = require_string(value, "custom_url")
    if not url:
        return ""
    if any(char.isspace() or ord(char) < 32 for char in url) or "\\" in url:
        raise OwnerArgumentError("custom_url must be an absolute HTTP or HTTPS URL without whitespace")
    try:
        parts = urlsplit(url)
        if parts.scheme in {"http", "https"} and parts.hostname:
            return url
    except ValueError as exc:
        raise OwnerArgumentError("custom_url is not a valid HTTP or HTTPS URL") from exc
    raise OwnerArgumentError("custom_url must be an absolute HTTP or HTTPS URL")


def _decimal(value: object, minimum: float, maximum: float, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
        raise OwnerArgumentError(f"{field} must be a number between {minimum} and {maximum}")
    return float(value)


def parse_background(
    value: object, current: BackgroundSettings, allow_uploaded_file: bool
) -> BackgroundSettings:
    data = object_fields(value, "background")
    fields = ("mode", "custom_url", "fit", "dim", "blur", "surface_alpha", "readability_scrim")
    require_fields(data, (*fields, "uploaded_file") if allow_uploaded_file else fields)
    uploaded_file = require_string(data.get("uploaded_file", current.uploaded_file), "uploaded_file")
    if uploaded_file:
        filename(uploaded_file, "uploaded_file")
    blur = data.get("blur", current.blur)
    if isinstance(blur, bool) or not isinstance(blur, int) or not 0 <= blur <= 32:
        raise OwnerArgumentError("blur must be an integer between 0 and 32")
    return BackgroundSettings(
        mode=require_choice(data.get("mode", current.mode), ("off", "skin", "custom"), "mode"),
        custom_url=_background_url(data.get("custom_url", current.custom_url)),
        uploaded_file=uploaded_file,
        fit=require_choice(data.get("fit", current.fit), ("cover", "contain"), "fit"),
        dim=_decimal(data.get("dim", current.dim), 0.0, 0.85, "dim"),
        blur=blur,
        surface_alpha=_decimal(data.get("surface_alpha", current.surface_alpha), 0.20, 1.0, "surface_alpha"),
        readability_scrim=_decimal(data.get("readability_scrim", current.readability_scrim), 0.0, 1.0, "readability_scrim"),
    )


def parse_preferences(value: object) -> UserSkinPreferences:
    data = object_fields(value, "preferences.json")
    return UserSkinPreferences(
        skin_enabled=require_bool(data.get("skin_enabled", False), "skin_enabled"),
        active_skin_id=nullable_skin_id(data.get("active_skin_id"), "active_skin_id"),
        background=parse_background(data.get("background", {}), DEFAULT_PREFERENCES.background, True),
        intro=parse_intro_preferences(data.get("intro", {}), DEFAULT_INTRO_PREFERENCES),
    )


@dataclass(frozen=True, slots=True)
class IntroLayer:
    src: str
    in_sec: float
    in_dur: float
    out_sec: float
    out_dur: float
    reveal: RevealMode
    origin: tuple[float, float]

    def to_state(self) -> IntroLayerState:
        return cast(IntroLayerState, {**asdict(self), "origin": list(self.origin)})


@dataclass(frozen=True, slots=True)
class IntroBurst:
    start_sec: float
    end_sec: float
    from_point: tuple[float, float]
    to_point: tuple[float, float]
    scale: float
    intensity: float
    anamorphic: float

    def to_state(self) -> IntroBurstState:
        return cast(
            IntroBurstState, {**asdict(self), "from_point": list(self.from_point), "to_point": list(self.to_point)}
        )


@dataclass(frozen=True, slots=True)
class IntroSubtitle:
    in_sec: float
    out_sec: float
    primary: str
    secondary: str

    def to_state(self) -> IntroSubtitleState:
        return cast(IntroSubtitleState, asdict(self))


@dataclass(frozen=True, slots=True)
class IntroManifest:
    id: str
    name: str
    version: str
    author: str
    description: str
    source: SkinSource
    mode: IntroMode
    duration: float
    outro_start: float
    audio: str
    video: str
    loop_video: str
    auto_stages_image: str
    fx_preset: FxPreset
    focal_point: tuple[float, float]
    secondary_point: tuple[float, float]
    layers: tuple[IntroLayer, ...]
    bursts: tuple[IntroBurst, ...]
    subtitles: tuple[IntroSubtitle, ...]

    def to_state(self) -> IntroManifestState:
        return cast(
            IntroManifestState,
            {
                **asdict(self),
                "focal_point": list(self.focal_point),
                "secondary_point": list(self.secondary_point),
                "layers": [layer.to_state() for layer in self.layers],
                "bursts": [burst.to_state() for burst in self.bursts],
                "subtitles": [subtitle.to_state() for subtitle in self.subtitles],
            },
        )


def _point(value: object, field: str, minimum: float, maximum: float) -> tuple[float, float]:
    if not isinstance(value, list) or len(value) != 2:
        raise OwnerArgumentError(f"{field} must contain two coordinates")
    return _decimal(value[0], minimum, maximum, field), _decimal(value[1], minimum, maximum, field)


def _entries(value: object, field: str) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise OwnerArgumentError(f"{field} must be an array")
    return [object_fields(row, field) for row in value]


def _layer(row: dict[str, object], duration: float) -> IntroLayer:
    require_fields(row, ("src", "in_sec", "in_dur", "out_sec", "out_dur", "reveal", "origin"))
    start = _decimal(row.get("in_sec"), 0, duration, "layer.in_sec")
    end = _decimal(row.get("out_sec"), 0, duration, "layer.out_sec")
    if end != 0 and end < start:
        raise OwnerArgumentError("layer.out_sec must follow layer.in_sec or be zero")
    return IntroLayer(
        relative_path(row.get("src"), "layer.src"),
        start,
        _decimal(row.get("in_dur"), 0, duration - start, "layer.in_dur"),
        end,
        _decimal(row.get("out_dur"), 0, duration, "layer.out_dur"),
        require_choice(row.get("reveal"), ("radial", "fade", "wipe"), "layer.reveal"),
        _point(row.get("origin"), "layer.origin", -0.5, 1.5),
    )


def _burst(row: dict[str, object], duration: float) -> IntroBurst:
    require_fields(row, ("start_sec", "end_sec", "from_point", "to_point", "scale", "intensity", "anamorphic"))
    start = _decimal(row.get("start_sec"), 0, duration, "burst.start_sec")
    return IntroBurst(
        start,
        _decimal(row.get("end_sec"), start, duration, "burst.end_sec"),
        _point(row.get("from_point"), "burst.from_point", -0.5, 1.5),
        _point(row.get("to_point"), "burst.to_point", -0.5, 1.5),
        _decimal(row.get("scale"), 0, 100, "burst.scale"),
        _decimal(row.get("intensity"), 0, 100, "burst.intensity"),
        _decimal(row.get("anamorphic"), 0, 100, "burst.anamorphic"),
    )


def _subtitle(row: dict[str, object], duration: float) -> IntroSubtitle:
    require_fields(row, ("in_sec", "out_sec", "primary", "secondary"))
    start = _decimal(row.get("in_sec"), 0, duration, "subtitle.in_sec")
    return IntroSubtitle(
        start,
        _decimal(row.get("out_sec"), start, duration, "subtitle.out_sec"),
        require_string(row.get("primary"), "subtitle.primary"),
        require_string(row.get("secondary"), "subtitle.secondary"),
    )


def _intro_path(data: Mapping[str, object], field: str) -> str:
    value = require_string(data.get(field, ""), field)
    return relative_path(value, field) if value else ""


def parse_intro_manifest(raw: object, source: SkinSource) -> IntroManifest:
    data = object_fields(raw, "intro.json")
    require_fields(data, tuple(IntroManifestState.__annotations__))
    if "source" in data:
        require_choice(data["source"], ("builtin", "custom"), "source")
    name = require_string(data.get("name"), "name").strip()
    if not name:
        raise OwnerArgumentError("name must not be empty")
    mode: IntroMode = require_choice(data.get("mode"), _INTRO_MODES, "mode")
    duration = _decimal(data.get("duration", 10.5), 2, 120, "duration")
    audio = require_string(data.get("audio", ""), "audio")
    if audio and audio != "synth:starlight":
        relative_path(audio, "audio")
    video, hero = _intro_path(data, "video"), _intro_path(data, "auto_stages_image")
    layers = tuple(_layer(row, duration) for row in _entries(data.get("layers", []), "layers"))
    if bool(video) != (mode == "video") or bool(hero) != (mode == "single"):
        raise OwnerArgumentError(
            "Video mode requires video; single mode requires auto_stages_image. Other modes must leave those fields empty."
        )
    if mode == "director" and not layers:
        raise OwnerArgumentError("Director mode requires at least one layer")
    return IntroManifest(
        filename(require_skin_id(data.get("id"), "id"), "id"),
        name,
        require_string(data.get("version", "1.0.0"), "version"),
        require_string(data.get("author", ""), "author"),
        require_string(data.get("description", ""), "description"),
        source,
        mode,
        duration,
        _decimal(data.get("outro_start", max(0.5, duration - 2.3)), 0.5, duration, "outro_start"),
        audio,
        video,
        _intro_path(data, "loop_video"),
        hero,
        require_choice(
            data.get("fx_preset", "starlight-cyan"),
            ("starlight-cyan", "amber-firefly", "sakura-petals", "cyber-neon", "minimal-clean"),
            "fx_preset",
        ),
        _point(data.get("focal_point", [0.5, 0.5]), "focal_point", 0, 1),
        _point(data.get("secondary_point", [0.25, 0.65]), "secondary_point", 0, 1),
        layers,
        tuple(_burst(row, duration) for row in _entries(data.get("bursts", []), "bursts")),
        tuple(_subtitle(row, duration) for row in _entries(data.get("subtitles", []), "subtitles")),
    )


def parse_intro_preferences(raw: object, current: IntroPreferences) -> IntroPreferences:
    data = object_fields(raw, "intro preferences")
    require_fields(data, tuple(IntroPreferencesState.__annotations__))
    intro_id = nullable_skin_id(data.get("active_intro_id", current.active_intro_id), "active_intro_id")
    if intro_id is not None:
        filename(intro_id, "active_intro_id")
    return IntroPreferences(
        require_bool(data.get("enabled", current.enabled), "enabled"),
        intro_id,
        require_bool(data.get("play_on_startup", current.play_on_startup), "play_on_startup"),
        require_bool(data.get("keep_live_wallpaper", current.keep_live_wallpaper), "keep_live_wallpaper"),
        _decimal(data.get("volume", current.volume), 0, 1, "volume"),
        require_bool(data.get("muted", current.muted), "muted"),
    )
