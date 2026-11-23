"""Validated skin and preference models and their owner wire representation."""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Literal, TypedDict, TypeVar
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


class PreferencesState(TypedDict):
    skin_enabled: bool
    active_skin_id: str | None
    background: BackgroundState


class OwnerState(TypedDict):
    preferences: PreferencesState
    skins: list[SkinManifestState]
    active_skin_payload: ActiveSkinState | None
    custom_skins_rel_hint: str


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

    def to_state(self) -> BackgroundState:
        return {
            "mode": self.mode,
            "custom_url": self.custom_url,
            "uploaded_file": self.uploaded_file,
            "fit": self.fit,
            "dim": self.dim,
            "blur": self.blur,
            "surface_alpha": self.surface_alpha,
        }


@dataclass(frozen=True, slots=True)
class UserSkinPreferences:
    skin_enabled: bool
    active_skin_id: str | None
    background: BackgroundSettings

    def to_state(self) -> PreferencesState:
        return {
            "skin_enabled": self.skin_enabled,
            "active_skin_id": self.active_skin_id,
            "background": self.background.to_state(),
        }


DEFAULT_PREFERENCES = UserSkinPreferences(
    skin_enabled=False,
    active_skin_id=None,
    background=BackgroundSettings("skin", "", "", "cover", 0.24, 14, 0.76),
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
    fields = ("mode", "custom_url", "fit", "dim", "blur", "surface_alpha")
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
    )


def parse_preferences(value: object) -> UserSkinPreferences:
    data = object_fields(value, "preferences.json")
    return UserSkinPreferences(
        skin_enabled=require_bool(data.get("skin_enabled", False), "skin_enabled"),
        active_skin_id=nullable_skin_id(data.get("active_skin_id"), "active_skin_id"),
        background=parse_background(data.get("background", {}), DEFAULT_PREFERENCES.background, True),
    )
