"""HTTP routes for skin assets, uploaded wallpapers, and the starter template."""

import mimetypes
from pathlib import Path
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from kohakuterrarium.api.ext import get_auth_config, require_user
from kohakuterrarium.modules.ui_owner import OwnerArgumentError

from .models import filename as validate_filename
from .storage import (
    IMAGE_TYPES,
    StorageScope,
    build_starter_template_zip,
    find_skin,
    resolve_file,
    storage_scope,
)

router = APIRouter()

_FONT_TYPES = {
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
}


class _User(Protocol):
    @property
    def id(self) -> int: ...


def _read_scope(request: Request, user: _User | None) -> StorageScope:
    config = get_auth_config(request)
    return storage_scope(config.multi_user_enabled, user.id if user is not None else None, False)


def _asset_response(path: Path) -> FileResponse:
    suffix = path.suffix.lower()
    media_type = IMAGE_TYPES.get(suffix) or _FONT_TYPES.get(suffix) or mimetypes.guess_type(path.name)[0]
    headers = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-cache"}
    if media_type == "image/svg+xml":
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    if media_type and (media_type.startswith(("image/", "font/", "audio/", "video/")) or media_type == "text/css"):
        return FileResponse(path, media_type=media_type, headers=headers)
    return FileResponse(path, media_type="application/octet-stream", filename=path.name, headers=headers)


@router.get("/skins/{skin_id}/assets/{asset_path:path}")
def skin_asset(
    skin_id: str, asset_path: str, request: Request, user: Annotated[_User | None, Depends(require_user)]
) -> FileResponse:
    scope = _read_scope(request, user)
    try:
        pack = find_skin(scope, skin_id)
        if pack is not None:
            path = resolve_file(pack.directory, asset_path)
            if path is None and not asset_path.startswith("assets/"):
                path = resolve_file(pack.directory, f"assets/{asset_path}")
            if path is not None:
                return _asset_response(path)
    except OwnerArgumentError as exc:
        raise HTTPException(status_code=404, detail="Skin asset not found") from exc
    raise HTTPException(status_code=404, detail="Skin asset not found")


@router.get("/wallpapers/{filename}")
def wallpaper(
    filename: str, request: Request, user: Annotated[_User | None, Depends(require_user)]
) -> FileResponse:
    directory = _read_scope(request, user).wallpapers
    try:
        validate_filename(filename, "filename")
        if directory is not None and Path(filename).suffix.lower() in IMAGE_TYPES:
            path = resolve_file(directory, filename)
            if path is not None and path.suffix.lower() in IMAGE_TYPES:
                return _asset_response(path)
    except OwnerArgumentError as exc:
        raise HTTPException(status_code=404, detail="Wallpaper not found") from exc
    raise HTTPException(status_code=404, detail="Wallpaper not found")


@router.get("/template.zip")
def starter_template() -> Response:
    return Response(
        content=build_starter_template_zip(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="kohaku-skin-template.zip"'},
    )
