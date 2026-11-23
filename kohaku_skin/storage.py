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
import zlib
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory
from typing import Literal
from uuid import uuid4
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from kohakuterrarium.modules.ui_owner import OwnerArgumentError, OwnerForbiddenError
from kohakuterrarium.utils.config_dir import config_dir

from .models import (
    DEFAULT_PREFERENCES,
    ActiveSkinPayload,
    SkinManifest,
    SkinSource,
    UserSkinPreferences,
    filename,
    parse_manifest,
    parse_preferences,
    relative_path,
    require_skin_id,
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


def _valid_svg(content: bytes) -> bool:
    try:
        text = content.decode("utf-8-sig")
        lowered = text.lower()
        if any(marker in lowered for marker in ("<script", "<!doctype", "<!entity")):
            return False
        root = ElementTree.fromstring(text)
    except (ValueError, ElementTree.ParseError):
        return False
    return root.tag in {"svg", "{http://www.w3.org/2000/svg}svg"} and not any(
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
