"""Discover skins and persist validated changes under KohakuTerrarium's config root."""

import base64
import binascii
import io
import json
import logging
import lzma
import re
import shutil
import stat
import struct
import zlib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from tempfile import NamedTemporaryFile, SpooledTemporaryFile, TemporaryDirectory
from typing import IO, Literal, Protocol
from unicodedata import normalize
from uuid import uuid4
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZIP_STORED, BadZipFile, ZipFile

from kohakuterrarium.modules.ui_owner import OwnerArgumentError, OwnerForbiddenError
from kohakuterrarium.utils.config_dir import config_dir

from .models import (
    DEFAULT_PREFERENCES,
    ActiveSkinPayload,
    IntroManifest,
    SkinManifest,
    SkinSource,
    UserSkinPreferences,
    filename,
    object_fields,
    parse_intro_manifest,
    parse_manifest,
    parse_preferences,
    relative_path,
    require_skin_id,
    require_string,
)

MAX_BYTES = 15 * 1024 * 1024
MAX_FILES = 64
CUSTOM_SKINS_HINT = "kohaku-skin/skins"
BUILTIN_SKINS_DIR = Path(__file__).resolve().parent.parent / "skins"
IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
}
MAX_INTRO_BYTES = 120 * 1024 * 1024
CUSTOM_INTROS_HINT = "kohaku-skin/intros"
BUILTIN_INTROS_DIR = Path(__file__).resolve().parent.parent / "intros"
AUDIO_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
}
VIDEO_TYPES = {".mp4": "video/mp4", ".webm": "video/webm"}
INTRO_MEDIA_TYPES = IMAGE_TYPES | AUDIO_TYPES | VIDEO_TYPES
_CHUNK = 1024 * 1024
_EOCD = struct.Struct("<4s4H2IH")
_ZIP64_LOCATOR = struct.Struct("<4sIQI")
_ZIP64_EOCD = struct.Struct("<4sQ2H2I4Q")
_EOCD_WINDOW = _EOCD.size + 0xFFFF
_SKIN_HEADERS = re.compile(r"(?m)^\s*\*?\s*@(id|name|author|description):[ \t]*([^\r\n]+)")
_CSS_COMMENT = re.compile(r"/\*(.*?)\*/", re.DOTALL)
_LOG = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class StorageScope:
    shared_skins: Path
    user_dir: Path | None
    private_skins: Path | None
    writable_skins: Path | None

    @property
    def shared_intros(self) -> Path:
        return self.shared_skins.with_name("intros")

    @property
    def private_intros(self) -> Path | None:
        return self.private_skins.with_name("intros") if self.private_skins is not None else None

    @property
    def writable_intros(self) -> Path | None:
        return self.writable_skins.with_name("intros") if self.writable_skins is not None else None

    @property
    def wallpapers(self) -> Path | None:
        return self.user_dir / "wallpapers" if self.user_dir is not None else None


@dataclass(frozen=True, slots=True)
class SkinPack:
    directory: Path
    manifest: SkinManifest


def storage_scope(multi_user: bool, user_id: int | None, is_admin: bool) -> StorageScope:
    root = config_dir() / "kohaku-skin"
    shared = root / "skins"
    if not multi_user:
        return StorageScope(shared, root, None, shared)
    if user_id is None:
        return StorageScope(shared, None, None, None)
    if type(user_id) is not int or user_id < 0:
        raise OwnerForbiddenError("Invalid user scope")
    user_dir = root / "users" / str(user_id)
    private = user_dir / "skins"
    return StorageScope(shared, user_dir, private, shared if is_admin else private)


def resolve_file(directory: Path, path: str) -> Path | None:
    relative_path(path, "path")
    boundary = directory.resolve()
    target = (boundary / path).resolve()
    return target if target.is_relative_to(boundary) and target.is_file() else None


def _read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (UnicodeError, ValueError, RecursionError) as exc:
        raise OwnerArgumentError(f"{path.name} must contain valid UTF-8 JSON") from exc


def _decode_css(data: bytes) -> str:
    try:
        css = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise OwnerArgumentError("Skin CSS must be valid UTF-8") from exc
    if "\0" in css:
        raise OwnerArgumentError("Skin CSS must not contain NUL characters")
    return css


def _read_pack(directory: Path, source: SkinSource) -> SkinPack:
    path = resolve_file(directory, "skin.json")
    if path is None:
        raise OwnerArgumentError("Skin must contain skin.json")
    manifest = parse_manifest(_read_json(path), source)
    if resolve_file(directory, manifest.entry_css) is None:
        raise OwnerArgumentError(f"entry_css file {manifest.entry_css!r} is missing")
    if manifest.default_background and resolve_file(directory, manifest.default_background) is None:
        raise OwnerArgumentError(f"default_background file {manifest.default_background!r} is missing")
    return SkinPack(directory, manifest)


def _skin_roots(scope: StorageScope) -> list[tuple[Path, SkinSource]]:
    roots: list[tuple[Path, SkinSource]] = [(BUILTIN_SKINS_DIR, "builtin")]
    if scope.private_skins is not None:
        # A newly published shared pack cannot replace an existing private selection.
        roots.append((scope.private_skins, "custom"))
    roots.append((scope.shared_skins, "custom"))
    return roots


def _discover_pack(root: Path, skin_id: str, source: SkinSource) -> SkinPack | None:
    directory = root / skin_id
    if not directory.is_dir() or directory.resolve() != root.resolve() / skin_id:
        return None
    try:
        pack = _read_pack(directory, source)
        if pack.manifest.id != skin_id:
            raise OwnerArgumentError("Skin manifest id must match its folder name")
        return pack
    except (OwnerArgumentError, OSError) as exc:
        _LOG.warning("Skipping skin %s in %s: %s", skin_id, root, exc)
        return None


def find_skin(scope: StorageScope, skin_id: str) -> SkinPack | None:
    require_skin_id(skin_id, "skin_id")
    filename(skin_id, "skin_id")
    for root, source in _skin_roots(scope):
        pack = _discover_pack(root, skin_id, source)
        if pack is not None:
            return pack
    return None


def list_skins(scope: StorageScope) -> dict[str, SkinPack]:
    result: dict[str, SkinPack] = {}
    for root, source in _skin_roots(scope):
        if not root.is_dir():
            continue
        for directory in sorted(root.iterdir()):
            skin_id = directory.name
            if skin_id in result or not directory.is_dir():
                continue
            try:
                require_skin_id(skin_id, "skin folder name")
                filename(skin_id, "skin folder name")
            except OwnerArgumentError:
                # Staging and other non-skin directories are not candidates.
                continue
            pack = _discover_pack(root, skin_id, source)
            if pack is not None:
                result[skin_id] = pack
    return result


def load_active_payload(pack: SkinPack) -> ActiveSkinPayload:
    manifest = pack.manifest
    css = resolve_file(pack.directory, manifest.entry_css)
    if css is None:
        raise OwnerArgumentError(f"entry_css file {manifest.entry_css!r} is missing")
    return ActiveSkinPayload(
        manifest.id, manifest.name, _decode_css(css.read_bytes()), manifest.tokens, manifest.default_background
    )


def load_preferences(scope: StorageScope) -> UserSkinPreferences:
    if scope.user_dir is None:
        return DEFAULT_PREFERENCES
    try:
        return parse_preferences(_read_json(scope.user_dir / "preferences.json"))
    except FileNotFoundError:
        return DEFAULT_PREFERENCES


def _atomic_write(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = None
    try:
        with NamedTemporaryFile(dir=path.parent, prefix=".ks-", delete=False) as handle:
            staging = Path(handle.name)
            handle.write(contents)
        staging.replace(path)
    finally:
        if staging is not None:
            staging.unlink(missing_ok=True)


def save_preferences(scope: StorageScope, preferences: UserSkinPreferences) -> None:
    if scope.user_dir is None:
        raise OwnerForbiddenError("Sign in to change skin preferences")
    contents = json.dumps(preferences.to_state(), ensure_ascii=False, indent=2).encode("utf-8")
    _atomic_write(scope.user_dir / "preferences.json", contents)


def decode_upload(value: object) -> bytes:
    if not isinstance(value, str) or not value:
        raise OwnerArgumentError("content_base64 must be a non-empty base64 string")
    if len(value) > ((MAX_BYTES + 2) // 3) * 4:
        raise OwnerArgumentError("Upload exceeds the 15 MB limit")
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise OwnerArgumentError("content_base64 is not valid base64") from exc
    if len(data) > MAX_BYTES:
        raise OwnerArgumentError("Upload exceeds the 15 MB limit")
    return data


def _css_skin(upload_name: str, content: bytes) -> dict[str, bytes]:
    text = _decode_css(content)
    headers: dict[str, str] = {}
    for comment in _CSS_COMMENT.finditer(text):
        for key, value in _SKIN_HEADERS.findall(comment[1]):
            headers.setdefault(key, value.strip())
    stem = Path(upload_name).stem
    data = {
        "id": headers.get("id", re.sub(r"[^a-z0-9._-]+", "-", stem.lower()).strip("._-")[:64].rstrip(".")),
        "name": headers.get("name", stem),
        "author": headers.get("author", ""),
        "description": headers.get("description", ""),
    }
    return {"skin.json": json.dumps(data, ensure_ascii=False).encode("utf-8"), "theme.css": content}


def _zip_skin(content: bytes) -> dict[str, bytes]:
    try:
        with ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            files = [entry for entry in entries if not entry.is_dir()]
            if len(files) > MAX_FILES:
                raise OwnerArgumentError("Skin ZIP may contain at most 64 files")
            if sum(entry.file_size for entry in entries) > MAX_BYTES:
                raise OwnerArgumentError("Unpacked skin ZIP exceeds the 15 MB limit")
            paths: dict[str, bool] = {}
            file_names: list[str] = []
            for entry in entries:
                is_dir = entry.is_dir()
                name = relative_path(entry.orig_filename.removesuffix("/") if is_dir else entry.orig_filename, "ZIP entry")
                mode = stat.S_IFMT(entry.external_attr >> 16)
                if mode not in (0, stat.S_IFDIR if is_dir else stat.S_IFREG):
                    raise OwnerArgumentError("Skin ZIP may not contain symbolic links or special files")
                key = name.casefold()
                if key in paths:
                    raise OwnerArgumentError(f"Skin ZIP contains duplicate path {name!r}")
                paths[key] = is_dir
                if not is_dir:
                    file_names.append(name)
            for key in paths:
                parent = key.rpartition("/")[0]
                while parent:
                    if paths.get(parent) is False:
                        raise OwnerArgumentError("Skin ZIP contains a file used as a directory")
                    parent = parent.rpartition("/")[0]
            prefix = ""
            if "skin.json" not in file_names:
                top = {name.split("/", 1)[0] for name in file_names}
                if len(top) != 1:
                    raise OwnerArgumentError("Skin ZIP must include skin.json at the root or in one top-level folder")
                prefix = next(iter(top)) + "/"
                if prefix + "skin.json" not in file_names:
                    raise OwnerArgumentError("Skin ZIP must include skin.json at the root or in one top-level folder")
            return {name.removeprefix(prefix): archive.read(entry) for name, entry in zip(file_names, files, strict=True)}
    except (BadZipFile, EOFError, RuntimeError, NotImplementedError, UnicodeError, zlib.error, lzma.LZMAError) as exc:
        raise OwnerArgumentError("Could not read skin ZIP; provide a valid, unencrypted ZIP archive") from exc


def install_skin(scope: StorageScope, upload_format: Literal["zip", "css"], upload_name: str, content: bytes) -> SkinPack:
    destination = scope.writable_skins
    if destination is None:
        raise OwnerForbiddenError("Sign in to install skins")
    if Path(upload_name).suffix.lower() != f".{upload_format}":
        raise OwnerArgumentError(f"filename must end in .{upload_format}")
    files = _css_skin(upload_name, content) if upload_format == "css" else _zip_skin(content)
    try:
        raw_manifest: object = json.loads(files["skin.json"].decode("utf-8-sig"))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise OwnerArgumentError("skin.json must contain valid UTF-8 JSON") from exc
    manifest = parse_manifest(raw_manifest, "custom")
    skin_id = filename(manifest.id, "id")
    css = files.get(manifest.entry_css)
    if css is None:
        raise OwnerArgumentError(f"entry_css file {manifest.entry_css!r} is missing")
    _decode_css(css)
    if manifest.default_background and manifest.default_background not in files:
        raise OwnerArgumentError(f"default_background file {manifest.default_background!r} is missing")
    target = destination / skin_id
    if find_skin(scope, skin_id) is not None or target.exists() or target.is_symlink():
        raise OwnerArgumentError(f"A skin named {skin_id!r} already exists")
    destination.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination, prefix=".ks-") as temp:
        staging = Path(temp) / "skin"
        for path, data in files.items():
            item = staging / path
            item.parent.mkdir(parents=True, exist_ok=True)
            item.write_bytes(data)
        staging.rename(target)
    return SkinPack(target, manifest)


def delete_skin(scope: StorageScope, skin_id: str) -> None:
    pack = find_skin(scope, skin_id)
    if pack is None:
        raise OwnerArgumentError(f"Unknown skin: {skin_id!r}")
    if pack.manifest.source == "builtin":
        raise OwnerForbiddenError("Built-in skins cannot be deleted")
    if pack.directory.parent not in (scope.writable_skins, scope.private_skins):
        raise OwnerForbiddenError("Only admins may delete shared skins")
    shutil.rmtree(pack.directory)


def _svg_root(content: bytes) -> ElementTree.Element | None:
    try:
        text = content.decode("utf-8-sig")
        if any(marker in text.lower() for marker in ("<script", "<!doctype", "<!entity")):
            return None
        root = ElementTree.fromstring(text)
    except (ValueError, ElementTree.ParseError):
        return None
    return root if root.tag in {"svg", "{http://www.w3.org/2000/svg}svg"} else None


def _valid_svg(content: bytes) -> bool:
    root = _svg_root(content)
    return root is not None and not any(
        node.tag.rsplit("}", 1)[-1].lower() == "script" for node in root.iter()
    )


def _valid_image(extension: str, data: bytes) -> bool:
    if extension == ".svg":
        return _valid_svg(data)
    if extension == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if extension == ".gif":
        return data.startswith((b"GIF87a", b"GIF89a"))
    return data.startswith(b"RIFF") and data[8:12] == b"WEBP"


def upload_wallpaper(scope: StorageScope, upload_name: str, content: bytes) -> str:
    directory = scope.wallpapers
    if directory is None:
        raise OwnerForbiddenError("Sign in to upload a wallpaper")
    extension = Path(upload_name).suffix.lower()
    if extension not in IMAGE_TYPES or not _valid_image(extension, content):
        raise OwnerArgumentError("Upload a valid PNG, JPEG, WebP, GIF, or SVG without scripts")
    saved_name = f"{uuid4().hex}{extension}"
    _atomic_write(directory / saved_name, content)
    return saved_name


def remove_wallpaper(scope: StorageScope, saved_name: str) -> None:
    if scope.wallpapers is not None and saved_name:
        filename(saved_name, "uploaded_file")
        (scope.wallpapers / saved_name).unlink(missing_ok=True)


_TEMPLATE_CSS = """/* Each --ks-* custom property is optional. Scope styles to the active skin. */
html[data-ks-skin="my-custom-skin"] {
  /* Main background and common surfaces. */
  --ks-bg: #f1f7f6;
  --ks-surface: #fbfffe;
  --ks-surface-alt: #e7f2f0;
  --ks-chrome: #e0edeb;
  --ks-panel: #f4faf9;
  --ks-card: #ffffff;
  --ks-float: #fafffe;
  /* Text, borders, and highlights. */
  --ks-text: #183130;
  --ks-text-muted: #415f5e;
  --ks-text-faint: #5c7675;
  --ks-border: #b9ccca;
  --ks-border-strong: #849e9b;
  --ks-accent: #087c73;
  --ks-accent-secondary: #336f92;
  --ks-user-bubble: #d2efe9;
  /* Shape, typography, and backdrop defaults. */
  --ks-radius: 12px;
  --ks-font-sans: system-ui, sans-serif;
  --ks-font-mono: ui-monospace, monospace;
  --ks-surface-alpha: 0.76;
  --ks-backdrop-blur: 14px;
  --ks-bg-dim: 0.24;
}

/* Example app-shell customization. */
html[data-ks-skin="my-custom-skin"] .kt-v2 { accent-color: var(--ks-accent); }

/* Chat bubbles already inherit --ks-user-bubble. For other chat styles,
   prefix the host selector with the same skin scope. */
html[data-ks-skin="my-custom-skin"] .kt-conversation-user-bubble {
  border-radius: var(--ks-radius);
}
"""
_TEMPLATE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><pattern id="grid" width="42" height="42" patternUnits="userSpaceOnUse">
    <path d="M 42 0 H 0 V 42" fill="none" stroke="#97c6c0" stroke-width="1"/>
  </pattern></defs>
  <rect width="1200" height="800" fill="#d9f0ec"/>
  <rect width="1200" height="800" fill="url(#grid)"/>
</svg>
"""


def build_starter_template_zip() -> bytes:
    manifest = {
        "id": "my-custom-skin",
        "name": "My Custom Skin",
        "version": "1.0.0",
        "author": "",
        "description": "A starter skin for KohakuTerrarium",
        "color_mode": "light",
        "entry_css": "theme.css",
        "default_background": "assets/bg-sample.svg",
        "tokens": {},
    }
    stream = io.BytesIO()
    with ZipFile(stream, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("skin.json", json.dumps(manifest, indent=2))
        archive.writestr("theme.css", _TEMPLATE_CSS)
        archive.writestr("assets/bg-sample.svg", _TEMPLATE_SVG)
    return stream.getvalue()


@dataclass(frozen=True, slots=True)
class IntroPack:
    directory: Path
    manifest: IntroManifest


class ByteReader(Protocol):
    def read(self, size: int, /) -> bytes: ...


class _SeekableByteStream(ByteReader, Protocol):
    def seek(self, offset: int, whence: int, /) -> int: ...
    def tell(self) -> int: ...


class _ZipOutput(Protocol):
    def write(self, data: bytes, /) -> int: ...
    def seek(self, offset: int, /) -> int: ...
    def tell(self) -> int: ...
    def flush(self) -> None: ...
    def close(self) -> None: ...


@dataclass(frozen=True, slots=True)
class IntroUpload:
    name: str
    stream: ByteReader


def _plain(path: Path) -> bool:
    try:
        info = path.lstat()
    except (FileNotFoundError, NotADirectoryError):
        return False
    return not (
        stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def _intro_roots(scope: StorageScope) -> list[tuple[Path, SkinSource]]:
    custom = [root for root in (scope.private_intros, scope.shared_intros) if root is not None]
    return [(BUILTIN_INTROS_DIR, "builtin"), *((root, "custom") for root in custom if _safe_intro_root(scope, root))]


def _safe_intro_root(scope: StorageScope, root: Path) -> bool:
    base = scope.shared_intros.parent.parent
    try:
        return root.resolve() == base.resolve() / root.relative_to(base)
    except (OSError, RuntimeError) as exc:
        _LOG.warning("Could not resolve intro root %s: %s", root, exc)
        return False


def _intro_file(directory: Path, name: str) -> Path:
    current = directory
    for part in relative_path(name, "intro resource").split("/"):
        current /= part
        if not _plain(current):
            raise OwnerArgumentError(f"Intro resource {name!r} is missing or linked")
    if not current.is_file():
        raise OwnerArgumentError(f"Intro resource {name!r} must be a file")
    return current


def _intro_refs(manifest: IntroManifest) -> dict[str, dict[str, str]]:
    paths = [
        (manifest.auto_stages_image, IMAGE_TYPES),
        (manifest.video, VIDEO_TYPES),
        (manifest.loop_video, VIDEO_TYPES),
        *((layer.src, IMAGE_TYPES) for layer in manifest.layers),
    ]
    if not manifest.audio.startswith("synth:"):
        paths.append((manifest.audio, AUDIO_TYPES))
    result = {}
    for name, types in paths:
        if name:
            if Path(name).suffix.lower() not in types:
                raise OwnerArgumentError(f"Invalid media extension for intro resource {name!r}")
            result[name] = types
    return result


def _valid_intro_svg(content: bytes) -> bool:
    root = _svg_root(content)
    if root is None or b"<?xml-stylesheet" in content.lower():
        return False
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1].lower()
        if tag in {"script", "foreignobject", "style", "animate", "animatemotion", "animatetransform", "set"}:
            return False
        for key, value in node.attrib.items():
            name = key.rsplit("}", 1)[-1].lower()
            if name.startswith("on") or name == "style":
                return False
            if name in {"href", "src", "base"} and not value.startswith("#"):
                return False
            if "url(" in value.lower() and not re.fullmatch(r"url\(#[\w.-]+\)", value):
                return False
    return True


@lru_cache(maxsize=128)
def _checked_intro_svg(resource: Path, identity: tuple[int, ...]) -> bool:
    # The identity is part of the cache key; path safety is rechecked by the caller.
    return _valid_intro_svg(resource.read_bytes())


def _read_intro_pack(directory: Path, source: SkinSource) -> IntroPack:
    path = _intro_file(directory, "intro.json")
    size = path.stat().st_size
    if size > MAX_BYTES:
        raise OwnerArgumentError("intro.json exceeds the 15 MB manifest limit")
    manifest = parse_intro_manifest(_read_json(path), source)
    refs = _intro_refs(manifest)
    if len(refs) >= MAX_FILES:
        raise OwnerArgumentError("Intro manifest and its resources may contain at most 64 files")
    for name, types in refs.items():
        resource = _intro_file(directory, name)
        info = resource.stat()
        size += info.st_size
        if size > MAX_INTRO_BYTES:
            raise OwnerArgumentError("Intro resources exceed the 120 MB limit")
        suffix = resource.suffix.lower()
        if suffix == ".svg":
            identity = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
            if not _checked_intro_svg(resource, identity):
                raise OwnerArgumentError(f"Unsafe or invalid SVG: {name!r}")
        elif types is IMAGE_TYPES:
            with resource.open("rb") as stream:
                if not _valid_image(suffix, stream.read(12)):
                    raise OwnerArgumentError(f"Invalid image: {name!r}")
        elif not info.st_size:
            raise OwnerArgumentError(f"Empty media: {name!r}")
    return IntroPack(directory, manifest)


def _intro_id(value: object) -> str:
    return filename(require_skin_id(value, "intro_id"), "intro_id")


def _discover_intro(root: Path, intro_id: str, source: SkinSource) -> IntroPack | None:
    directory = root / intro_id
    try:
        if not _plain(directory) or not directory.is_dir():
            return None
        pack = _read_intro_pack(directory, source)
        if pack.manifest.id != intro_id:
            raise OwnerArgumentError("Intro manifest id must match its folder name")
        return pack
    except (OwnerArgumentError, OSError) as exc:
        _LOG.warning("Skipping intro %s in %s: %s", intro_id, root, exc)
        return None


def find_intro(scope: StorageScope, intro_id: str) -> IntroPack | None:
    key = _intro_id(intro_id)
    return next((pack for root, source in _intro_roots(scope) if (pack := _discover_intro(root, key, source))), None)


def list_intros(scope: StorageScope) -> dict[str, IntroPack]:
    result: dict[str, IntroPack] = {}
    for root, source in _intro_roots(scope):
        try:
            directories = sorted(root.iterdir()) if root.is_dir() else []
        except OSError as exc:
            _LOG.warning("Could not scan intro root %s: %s", root, exc)
            continue
        for directory in directories:
            if directory.name in result:
                continue
            try:
                key = _intro_id(directory.name)
            except OwnerArgumentError:
                continue  # Staging and non-pack folders are not discoverable.
            if pack := _discover_intro(root, key, source):
                result[key] = pack
    return result


def intro_asset(pack: IntroPack, name: str) -> Path | None:
    safe = relative_path(name, "asset_path")
    refs = _intro_refs(pack.manifest)
    if safe not in refs:
        safe = f"assets/{safe}"
    return _intro_file(pack.directory, safe) if safe in refs else None


def _intro_destination(scope: StorageScope) -> Path:
    destination = scope.writable_intros
    if destination is None or not _safe_intro_root(scope, destination):
        raise OwnerForbiddenError("No writable intro scope")
    destination.mkdir(parents=True, exist_ok=True)
    return destination


def _intro_exists(scope: StorageScope, destination: Path, key: str) -> bool:
    target = destination / key
    return target.exists() or target.is_symlink() or find_intro(scope, key) is not None


def _commit_intro(scope: StorageScope, destination: Path, staging: Path) -> IntroPack:
    pack = _read_intro_pack(staging, "custom")
    key = pack.manifest.id
    if _intro_exists(scope, destination, key):
        raise OwnerArgumentError(f"An intro named {key!r} already exists")
    target = destination / key
    staging.rename(target)
    return IntroPack(target, pack.manifest)


def _copy_intro(source: ByteReader, target: Path, remaining: int) -> int:
    target.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with target.open("xb") as output:
        while chunk := source.read(_CHUNK):
            size += len(chunk)
            if size > remaining:
                raise OwnerArgumentError("Intro upload or unpacked ZIP exceeds the 120 MB limit")
            output.write(chunk)
    return size


def _zip_directory_counts(content: _SeekableByteStream, size: int) -> tuple[int, int]:
    # Match ZipFile's footer selection so the limits apply to the directory it will read.
    tail_offset = max(size - _EOCD_WINDOW, 0)
    content.seek(tail_offset, io.SEEK_SET)
    tail = content.read(size - tail_offset)
    footer = len(tail) - _EOCD.size
    if footer < 0 or not (tail[footer : footer + 4] == b"PK\x05\x06" and tail[-2:] == b"\x00\x00"):
        footer = tail.rfind(b"PK\x05\x06")
    if footer < 0 or len(tail) - footer < _EOCD.size:
        raise OwnerArgumentError("Intro upload must be a valid ZIP archive")
    _, _, _, _, entries, directory_size, _, _ = _EOCD.unpack_from(tail, footer)

    locator_offset = tail_offset + footer - _ZIP64_LOCATOR.size
    if locator_offset < 0:
        return entries, directory_size
    content.seek(locator_offset, io.SEEK_SET)
    signature, disk, declared_offset, disks = _ZIP64_LOCATOR.unpack(content.read(_ZIP64_LOCATOR.size))
    if signature != b"PK\x06\x07":
        return entries, directory_size
    fixed_offset = locator_offset - _ZIP64_EOCD.size
    if disk != 0 or disks > 1 or not 0 <= declared_offset <= fixed_offset:
        raise BadZipFile("Invalid ZIP64 central directory locator")

    # A prepended executable can shift ZIP64 offsets. Bound both possible headers.
    candidates: dict[int, tuple[int, int]] = {}
    for offset in {declared_offset, fixed_offset}:
        content.seek(offset, io.SEEK_SET)
        signature, _, _, _, _, _, _, count, byte_count, _ = _ZIP64_EOCD.unpack(content.read(_ZIP64_EOCD.size))
        if signature == b"PK\x06\x06":
            candidates[offset] = (count, byte_count)
    if not candidates:
        raise BadZipFile("Missing ZIP64 end of central directory")
    if fixed_offset not in candidates:
        # Older ZipFile versions fall back to the classic record if the fixed header is absent.
        candidates[tail_offset + footer] = (entries, directory_size)
    directories = candidates.values()
    return max(count for count, _ in directories), max(length for _, length in directories)


def _extract_intro(content: IO[bytes] | SpooledTemporaryFile[bytes], stage: Path) -> None:
    content.seek(0, io.SEEK_END)
    size = content.tell()
    if size > MAX_INTRO_BYTES:
        raise OwnerArgumentError("Intro ZIP exceeds the 120 MB limit")
    try:
        # Bound central-directory allocation before ZipFile constructs its entry objects.
        entries_total, directory_size = _zip_directory_counts(content, size)
        if entries_total > MAX_FILES * 4 or directory_size > _CHUNK:
            raise OwnerArgumentError("Intro ZIP central directory exceeds the pack limits")
        with ZipFile(content) as archive:
            entries = archive.infolist()
            files = {}
            paths: dict[str, bool] = {}
            if len(entries) > MAX_FILES * 4 or sum(not entry.is_dir() for entry in entries) > MAX_FILES:
                raise OwnerArgumentError("Intro ZIP may contain at most 64 files")
            if sum(entry.file_size for entry in entries) > MAX_INTRO_BYTES:
                raise OwnerArgumentError("Unpacked intro ZIP exceeds the 120 MB limit")
            for entry in entries:
                directory = entry.is_dir()
                name = relative_path(
                    entry.orig_filename.removesuffix("/") if directory else entry.orig_filename, "ZIP entry"
                )
                mode = stat.S_IFMT(entry.external_attr >> 16)
                if (
                    mode not in (0, stat.S_IFDIR if directory else stat.S_IFREG)
                    or entry.external_attr & stat.FILE_ATTRIBUTE_REPARSE_POINT
                ):
                    raise OwnerArgumentError("Intro ZIP may not contain links or special files")
                if entry.compress_type not in (ZIP_STORED, ZIP_DEFLATED):
                    raise OwnerArgumentError("Intro ZIP must use stored or DEFLATE compression")
                key = normalize("NFC", name).casefold()
                if key in paths:
                    raise OwnerArgumentError(f"Intro ZIP contains duplicate path {name!r}")
                paths[key] = directory
                if not directory:
                    files[name] = entry
            for key in paths:
                parent = key.rpartition("/")[0]
                while parent:
                    if paths.get(parent) is False:
                        raise OwnerArgumentError("Intro ZIP contains a file used as a directory")
                    parent = parent.rpartition("/")[0]
            prefix = ""
            if "intro.json" not in files:
                top = {name.partition("/")[0] for name in files}
                if len(top) == 1:
                    prefix = next(iter(top)) + "/"
                if not prefix or prefix + "intro.json" not in files:
                    raise OwnerArgumentError("Intro ZIP needs intro.json at the root or in one top-level folder")
            remaining = MAX_INTRO_BYTES
            for name, entry in files.items():
                with archive.open(entry) as stream:
                    remaining -= _copy_intro(stream, stage / name.removeprefix(prefix), remaining)
    except (
        BadZipFile,
        struct.error,
        EOFError,
        RuntimeError,
        NotImplementedError,
        UnicodeError,
        zlib.error,
        lzma.LZMAError,
        FileExistsError,
    ) as exc:
        raise OwnerArgumentError("Could not extract a valid, unencrypted intro ZIP") from exc


def install_intro_zip(
    scope: StorageScope, upload_name: str, content: IO[bytes] | SpooledTemporaryFile[bytes]
) -> IntroPack:
    if Path(upload_name).suffix.lower() != ".zip":
        raise OwnerArgumentError("Intro upload must end in .zip")
    destination = _intro_destination(scope)
    with TemporaryDirectory(dir=destination, prefix=".ks-") as temp:
        stage = Path(temp) / "intro"
        _extract_intro(content, stage)
        return _commit_intro(scope, destination, stage)


def create_intro_pack(scope: StorageScope, spec: object, uploads: dict[str, IntroUpload]) -> IntroPack:
    destination = _intro_destination(scope)
    data = dict(object_fields(spec, "spec_json"))
    mode = data.get("mode")
    if mode not in ("single", "video"):
        raise OwnerArgumentError("The wizard supports single and video modes")
    if ("auto_stages_image" in uploads) != (mode == "single") or ("video" in uploads) != (mode == "video"):
        raise OwnerArgumentError("Supply exactly one hero_image (single mode) or video_file (video mode)")
    if "id" not in data or data["id"] == "":
        name = require_string(data.get("name"), "name")
        slug = (
            re.sub(r"[^a-z0-9]+", "-", normalize("NFKD", name).encode("ascii", "ignore").decode().lower())
            .strip("-")[:64]
            .rstrip("-")
            or "intro"
        )
        if _intro_exists(scope, destination, slug):
            slug = f"{slug[:55]}-{uuid4().hex[:8]}"
        data["id"] = slug
    media = {
        "auto_stages_image": ("hero", IMAGE_TYPES),
        "audio": ("audio", AUDIO_TYPES),
        "video": ("intro", VIDEO_TYPES),
        "loop_video": ("loop", VIDEO_TYPES),
    }
    with TemporaryDirectory(dir=destination, prefix=".ks-") as temp:
        stage = Path(temp) / "intro"
        stage.mkdir()
        remaining = MAX_INTRO_BYTES
        for field, upload in uploads.items():
            stem, types = media[field]
            suffix = Path(upload.name).suffix.lower()
            if suffix not in types:
                raise OwnerArgumentError(f"Unsupported {field} extension: {suffix or '(none)'}")
            name = f"assets/{stem}{suffix}"
            remaining -= _copy_intro(upload.stream, stage / name, remaining)
            data[field] = name
        manifest = parse_intro_manifest(data, "custom")
        (stage / "intro.json").write_text(
            json.dumps(manifest.to_state(), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return _commit_intro(scope, destination, stage)


def delete_intro(scope: StorageScope, intro_id: str) -> None:
    pack = find_intro(scope, intro_id)
    if pack is None:
        raise OwnerArgumentError(f"Unknown intro: {intro_id!r}")
    if pack.manifest.source == "builtin":
        raise OwnerForbiddenError("Built-in intros cannot be deleted")
    if pack.directory.parent not in (scope.writable_intros, scope.private_intros):
        raise OwnerForbiddenError("Only admins may delete shared intros")
    shutil.rmtree(pack.directory)


def _write_intro_zip(pack: IntroPack, output: _ZipOutput, template: bool) -> None:
    manifest = pack.manifest.to_state()
    if template:
        manifest.update(id="my-boot-intro", name="My Boot Intro", source="custom")
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("intro.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for name in _intro_refs(pack.manifest):
            archive.write(_intro_file(pack.directory, name), name)
    if output.tell() > MAX_INTRO_BYTES:
        raise OwnerArgumentError("Exported ZIP exceeds the 120 MB import limit")
    output.seek(0)


def export_intro_zip(pack: IntroPack, output: _ZipOutput) -> None:
    _write_intro_zip(pack, output, False)


def build_intro_template_zip() -> bytes:
    output = io.BytesIO()
    _write_intro_zip(_read_intro_pack(BUILTIN_INTROS_DIR / "kohaku-starlight", "builtin"), output, True)
    return output.getvalue()
