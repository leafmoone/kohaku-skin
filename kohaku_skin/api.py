"""HTTP routes for skin assets, uploaded wallpapers, and the starter template."""

import json
import mimetypes
from collections.abc import Callable, Coroutine, Iterator
from dataclasses import replace
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.routing import APIRoute
from kohakuterrarium.api.ext import get_auth_config, require_user
from kohakuterrarium.modules.ui_owner import OwnerArgumentError, OwnerForbiddenError
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartException
from starlette.types import Message

from .models import IntroManifestState, require_choice
from .models import filename as validate_filename
from .storage import (
    IMAGE_TYPES,
    INTRO_MEDIA_TYPES,
    MAX_INTRO_BYTES,
    ByteReader,
    IntroPack,
    IntroUpload,
    StorageScope,
    build_intro_template_zip,
    build_starter_template_zip,
    create_intro_pack,
    delete_intro,
    export_intro_zip,
    find_intro,
    find_skin,
    install_intro_zip,
    intro_asset,
    load_preferences,
    resolve_file,
    save_preferences,
    storage_scope,
)
from .ui_owner import STATE_LOCK

_BODY_LIMIT = MAX_INTRO_BYTES + 1024 * 1024
_BODY_LIMIT_DETAIL = "Intro multipart request exceeds the upload limit"


class _IntroUploadRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[None, None, Response]]:
        handle = super().get_route_handler()
        if self.methods != {"POST"}:
            return handle

        async def bounded(request: Request) -> Response:
            length = request.headers.get("content-length", "")
            if length.isdecimal() and (len(length) > 12 or int(length) > _BODY_LIMIT):
                raise HTTPException(413, _BODY_LIMIT_DETAIL)
            count = 0

            async def receive() -> Message:
                nonlocal count
                message = await request.receive()
                if message["type"] == "http.request":
                    count += len(message.get("body", b""))
                    if count > _BODY_LIMIT:
                        # The multipart parser closes any partially spooled uploads on this exception.
                        raise MultiPartException(_BODY_LIMIT_DETAIL)
                return message

            try:
                return await handle(Request(request.scope, receive))
            except StarletteHTTPException as exc:
                if exc.detail == _BODY_LIMIT_DETAIL:
                    raise HTTPException(413, _BODY_LIMIT_DETAIL) from exc
                raise

        return bounded


router = APIRouter(route_class=_IntroUploadRoute)

_FONT_TYPES = {
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
}


class _User(Protocol):
    @property
    def id(self) -> int: ...

    @property
    def role(self) -> str: ...


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


_AuthUser = Annotated[_User | None, Depends(require_user)]


def _write_scope(request: Request, user: _User | None) -> StorageScope:
    config = get_auth_config(request)
    return storage_scope(
        config.multi_user_enabled, user.id if user is not None else None, user is not None and user.role == "admin"
    )


def _intro_or_404(scope: StorageScope, intro_id: str) -> IntroPack:
    try:
        pack = find_intro(scope, intro_id)
    except OwnerArgumentError as exc:
        raise HTTPException(404, "Intro not found") from exc
    if pack is None:
        raise HTTPException(404, "Intro not found")
    return pack


@router.get("/intros/{intro_id}/assets/{asset_path:path}")
def intro_media(intro_id: str, asset_path: str, request: Request, user: _AuthUser) -> FileResponse:
    pack = _intro_or_404(_read_scope(request, user), intro_id)
    try:
        path = intro_asset(pack, asset_path)
    except OwnerArgumentError as exc:
        raise HTTPException(404, "Intro asset not found") from exc
    if path is None:
        raise HTTPException(404, "Intro asset not found")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        "Vary": "Cookie, Authorization",
    }
    if path.suffix.lower() == ".svg":
        headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return FileResponse(path, media_type=INTRO_MEDIA_TYPES[path.suffix.lower()], headers=headers)


def _zip_headers(name: str) -> dict[str, str]:
    return {"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "private, no-store"}


def _response_chunks(stream: ByteReader) -> Iterator[bytes]:
    while chunk := stream.read(1024 * 1024):
        yield chunk


@router.get("/intros/{intro_id}/export.zip")
def intro_export(intro_id: str, request: Request, user: _AuthUser) -> StreamingResponse:
    # Response streaming owns the export stream after a successful build.
    stream = SpooledTemporaryFile(max_size=1024 * 1024, mode="w+b")  # noqa: SIM115
    try:
        with STATE_LOCK:
            pack = _intro_or_404(_read_scope(request, user), intro_id)
            export_intro_zip(pack, stream)
    except OwnerArgumentError as exc:
        stream.close()
        raise HTTPException(400, str(exc)) from exc
    except BaseException:
        stream.close()
        raise
    return StreamingResponse(
        _response_chunks(stream),
        media_type="application/zip",
        headers=_zip_headers(f"{pack.manifest.id}.zip"),
        background=BackgroundTask(stream.close),
    )


def _activation(raw: str) -> bool:
    return require_choice(raw, ("true", "false"), "activate") == "true"


def _activate_intro(scope: StorageScope, pack: IntroPack) -> None:
    try:
        preferences = load_preferences(scope)
        intro = replace(preferences.intro, enabled=True, active_intro_id=pack.manifest.id)
        save_preferences(scope, replace(preferences, intro=intro))
    except (OwnerArgumentError, OwnerForbiddenError, OSError):
        delete_intro(scope, pack.manifest.id)
        raise


@router.post("/intros/import-zip")
def intro_import(
    request: Request, user: _AuthUser, file: Annotated[UploadFile, File()], activate: Annotated[str, Form()] = "false"
) -> dict[str, IntroManifestState]:
    try:
        scope = _write_scope(request, user)
        chosen = _activation(activate)
        with STATE_LOCK:
            pack = install_intro_zip(scope, file.filename or "", file.file)
            if chosen:
                _activate_intro(scope, pack)
        return {"intro": pack.manifest.to_state()}
    except OwnerArgumentError as exc:
        raise HTTPException(400, str(exc)) from exc
    except OwnerForbiddenError as exc:
        raise HTTPException(403, str(exc)) from exc


@router.post("/intros/create")
def intro_create(
    request: Request,
    user: _AuthUser,
    spec_json: Annotated[str, Form()],
    activate: Annotated[str, Form()] = "false",
    hero_image: Annotated[UploadFile | None, File()] = None,
    audio_file: Annotated[UploadFile | None, File()] = None,
    video_file: Annotated[UploadFile | None, File()] = None,
    loop_video_file: Annotated[UploadFile | None, File()] = None,
) -> dict[str, IntroManifestState]:
    try:
        try:
            spec = json.loads(spec_json)
        except (ValueError, RecursionError) as exc:
            raise OwnerArgumentError("spec_json must contain valid JSON") from exc
        scope = _write_scope(request, user)
        chosen = _activation(activate)
        files = {
            "auto_stages_image": hero_image,
            "audio": audio_file,
            "video": video_file,
            "loop_video": loop_video_file,
        }
        uploads = {key: IntroUpload(f.filename or "", f.file) for key, f in files.items() if f is not None}
        with STATE_LOCK:
            pack = create_intro_pack(scope, spec, uploads)
            if chosen:
                _activate_intro(scope, pack)
        return {"intro": pack.manifest.to_state()}
    except OwnerArgumentError as exc:
        raise HTTPException(400, str(exc)) from exc
    except OwnerForbiddenError as exc:
        raise HTTPException(403, str(exc)) from exc


@router.get("/intro-template.zip")
def intro_template() -> Response:
    return Response(
        build_intro_template_zip(), media_type="application/zip", headers=_zip_headers("kohaku-intro-template.zip")
    )
